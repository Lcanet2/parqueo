#!/bin/sh
# Installeur Parqueo.
#
#   curl -fsSL https://parqueo.fr/install.sh | sh
#   curl -fsSL https://parqueo.fr/install.sh | sh -s -- --domaine support.entreprise.fr
#
# Ce script écrit un docker-compose.yml et un .env dans ./parqueo, génère les
# secrets, tire les images publiées et démarre la stack. Il ne compile rien et
# n'a besoin ni de git, ni de Node, ni des sources.
#
# POSIX sh volontairement : /bin/sh existe partout, bash non (Alpine, conteneurs
# minimaux, certaines images Debian dépouillées).

set -eu

# Surchargeable pour un fork, un miroir interne ou une installation hors ligne.
DEPOT_BRUT="${PARQUEO_SOURCE:-https://raw.githubusercontent.com/Lcanet2/parqueo/main}"
REPERTOIRE="${PARQUEO_DIR:-parqueo}"
DOMAINE=""

rouge()  { printf '\033[31m%s\033[0m\n' "$1" >&2; }
vert()   { printf '\033[32m%s\033[0m\n' "$1"; }
info()   { printf '%s\n' "$1"; }
abandon() { rouge "$1"; exit 1; }

# --- Arguments ---------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --domaine|--domain) DOMAINE="${2:-}"; shift 2 ;;
    --repertoire|--dir) REPERTOIRE="${2:-}"; shift 2 ;;
    -h|--help)
      cat <<'AIDE'
Installeur Parqueo

  --domaine <nom>    Nom de domaine public. Déclenche le certificat Let's
                     Encrypt automatique. Sans lui, Parqueo écoute en HTTP
                     sur le port 80.
  --repertoire <rép> Répertoire d'installation (défaut : ./parqueo).
AIDE
      exit 0 ;;
    *) abandon "Option inconnue : $1 (--help pour l'aide)" ;;
  esac
done

# --- Prérequis ---------------------------------------------------------------
command -v docker >/dev/null 2>&1 \
  || abandon "Docker est absent. Installez-le : https://docs.docker.com/engine/install/"

docker compose version >/dev/null 2>&1 \
  || abandon "Le plugin Docker Compose est absent. Voir https://docs.docker.com/compose/install/"

docker info >/dev/null 2>&1 \
  || abandon "Docker ne répond pas. Démarrez-le, ou ajoutez votre compte au groupe « docker »."

# --- Génération d'un secret --------------------------------------------------
# Trois sources par ordre de préférence ; /dev/urandom est le dernier recours et
# existe partout. Aucune ne demande d'outil que la machine n'aurait pas.
secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 36 | tr -d '\n/+=' | cut -c1-40
  elif [ -r /dev/urandom ]; then
    LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 40
  else
    abandon "Impossible de générer un secret : ni openssl ni /dev/urandom."
  fi
}

telecharger() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -qO "$2" "$1"
  else abandon "Ni curl ni wget : impossible de télécharger $1"
  fi
}

# --- Installation ------------------------------------------------------------
mkdir -p "$REPERTOIRE"
cd "$REPERTOIRE"

info "Téléchargement de la configuration…"
telecharger "$DEPOT_BRUT/docker-compose.prod.yml" docker-compose.yml

if [ -f .env ]; then
  # Réinstallation : on ne réécrit pas les secrets, cela invaliderait toutes les
  # sessions ouvertes et, pour la base, la rendrait inaccessible.
  info "Un .env existe déjà : secrets conservés."
else
  info "Génération des secrets…"
  {
    echo "# Généré par install.sh le $(date -u '+%Y-%m-%d %H:%M UTC')."
    echo "# JWT_SECRET et POSTGRES_PASSWORD ne doivent jamais être modifiés après"
    echo "# le premier démarrage : le premier invalide les sessions, le second"
    echo "# rend la base inaccessible."
    echo "JWT_SECRET=$(secret)"
    echo "POSTGRES_PASSWORD=$(secret)"
    if [ -n "$DOMAINE" ]; then
      echo "DOMAIN=$DOMAINE"
      # URL publique : sert aux liens des emails et à la redirection SSO.
      echo "PUBLIC_URL=https://$DOMAINE"
    fi
  } > .env
  chmod 600 .env
fi

info "Téléchargement des images…"
docker compose pull --quiet

info "Démarrage…"
docker compose up -d

# --- Attente de l'API --------------------------------------------------------
info "Attente du premier démarrage (migrations de la base)…"
i=0
while [ "$i" -lt 90 ]; do
  if docker compose exec -T api node -e \
      "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 2
done

if [ "$i" -ge 90 ]; then
  rouge "L'API n'a pas répondu à temps. Journaux :"
  docker compose logs --tail 40
  exit 1
fi

if [ -n "$DOMAINE" ]; then
  URL="https://$DOMAINE"
else
  # `|| echo localhost` ne rattrapait rien : le `||` porte sur awk, qui réussit
  # même sans entrée. Sur une machine sans `hostname -I`, l'URL affichée était
  # « http:// ». On teste donc la valeur obtenue, pas le code de retour.
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$IP" ] || IP="localhost"
  URL="http://$IP"
fi

echo
vert "Parqueo est installé."
echo
info "  Ouvrez $URL et créez votre compte administrateur."
echo
info "  Répertoire   : $(pwd)"
info "  Mise à jour  : cd $(pwd) && docker compose pull && docker compose up -d"
info "  Sauvegarde   : docker compose exec -T db pg_dump -U parqueo parqueo | gzip > parqueo.sql.gz"
info "  Arrêt        : docker compose down          (les données restent)"
echo
if [ -z "$DOMAINE" ]; then
  info "  Pour du HTTPS automatique, relancez avec : --domaine support.entreprise.fr"
fi
