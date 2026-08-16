#!/bin/sh
# Remise à zéro de l'instance de démonstration.
#
#   ./reinitialiser.sh
#
# Vide la base, la recrée, applique les migrations et repose le jeu de données.
# Efface aussi les fichiers déposés par les visiteurs.
#
# À lancer chaque nuit :
#   0 4 * * *  cd /opt/parqueo-demo && ./reinitialiser.sh >> reinit.log 2>&1
#
# Le service reste debout pendant l'opération : l'API redémarre à la fin et
# rejoue ses migrations. Compter une dizaine de secondes d'indisponibilité.

set -eu
cd "$(dirname "$0")"

DC="docker compose -f docker-compose.demo.yml"
UTILISATEUR="${POSTGRES_USER:-parqueo}"
BASE="${POSTGRES_DB:-parqueo}"

echo "[$(date -u '+%Y-%m-%d %H:%M UTC')] remise à zéro"

# Garde-fou : on ne vide une base que si l'instance est bien en mode
# démonstration. Lancer ce script par erreur sur une installation de production
# détruirait toutes les données.
if ! $DC exec -T api sh -c '[ "$DEMO_MODE" = true ]'; then
  echo "ABANDON : cette instance n'est pas en DEMO_MODE. Rien n'a été touché." >&2
  exit 1
fi

# 1. L'API s'arrête le temps de l'opération : une requête en cours rouvrirait
#    des connexions sur une base qu'on est en train de supprimer.
$DC stop api > /dev/null

# 2. Base recréée à neuf. DROP puis CREATE plutôt que TRUNCATE : les séquences
#    repartent de 1, et les numéros de tickets de la démonstration restent
#    lisibles au lieu de grimper indéfiniment.
$DC exec -T db psql -U "$UTILISATEUR" -d postgres -c "DROP DATABASE IF EXISTS \"$BASE\" WITH (FORCE);" > /dev/null
$DC exec -T db psql -U "$UTILISATEUR" -d postgres -c "CREATE DATABASE \"$BASE\" OWNER \"$UTILISATEUR\";" > /dev/null

# 3. Les fichiers déposés par les visiteurs partent avec le reste : sans ça, le
#    volume grossit indéfiniment et la démonstration finit par héberger
#    n'importe quoi.
$DC run --rm --no-deps --entrypoint sh api -c 'rm -rf /app/uploads/* || true' > /dev/null

# 4. Redémarrage : l'API applique les migrations, puis on repose le jeu de
#    données de démonstration.
$DC start api > /dev/null

printf 'attente de l’API'
i=0
while [ "$i" -lt 60 ]; do
  if $DC exec -T api node -e \
      "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      > /dev/null 2>&1; then
    echo " — prête"
    break
  fi
  printf '.'
  i=$((i + 1))
  sleep 2
done
[ "$i" -lt 60 ] || { echo; echo "ABANDON : l'API n'a pas redémarré." >&2; $DC logs --tail 30 api; exit 1; }

$DC exec -T api node prisma/seed-demo.js
# Puis le catalogue de demandes, les articles d'aide et les logiciels : sans eux
# la démonstration ne montrerait ni le Formcreator intégré ni la base de
# connaissances, qui sont deux arguments de vente.
$DC exec -T api node prisma/seed-demo-catalogue.js

echo "[$(date -u '+%Y-%m-%d %H:%M UTC')] terminé"
