# Instance de démonstration

Ce dossier déploie `demo.parqueo.fr` : une instance publique, ouverte à tous,
remise à zéro chaque nuit.

## Pourquoi elle n'est pas une installation ordinaire

Parqueo suppose partout que le rôle **administrateur est de confiance**. C'est un
arbitrage raisonnable pour un outil installé dans une entreprise, et la
documentation technique l'assume explicitement à propos du webhook sortant.

Une démonstration publique donne ce rôle à des inconnus, et l'hypothèse tombe.
`DEMO_MODE=true` neutralise donc précisément ce dont la sûreté en dépendait :

| Neutralisé | Pourquoi |
| --- | --- |
| Webhook de workflow | sinon le serveur POSTe vers l'adresse choisie par le visiteur — IP interne, service de métadonnées du fournisseur, cible externe arbitraire |
| Courrier sortant | sinon la démonstration devient un relais d'envoi |
| Collecteur IMAP, scan SNMP, synchro Intune | accès réseau depuis l'hôte, sans rapport avec ce qu'on vient voir |
| SSO Microsoft | redirection vers un tenant, sans objet ici |
| Envoi de photo de profil | c'est le seul fichier servi sans jeton : il ferait du domaine un hébergeur d'images anonyme |

Restent actives les pièces jointes de tickets — elles ne se téléchargent
qu'authentifié — et tout le reste : tickets, inventaire, workflows, catalogue,
base de connaissances.

## Prérequis

- Une machine avec Docker et le plugin Compose. **Pas un hébergement mutualisé** :
  il faut pouvoir exécuter des conteneurs.
- Un enregistrement DNS `demo.parqueo.fr` de type `A` (et `AAAA` si IPv6)
  pointant vers son adresse, **créé avant le premier démarrage** : Caddy demande
  le certificat Let's Encrypt dès qu'il se lance.
- Les ports 80 et 443 joignables depuis Internet.

## Mise en service

```sh
git clone https://github.com/Lcanet2/parqueo.git /opt/parqueo-demo
cd /opt/parqueo-demo/demo

cp .env.demo.example .env
printf 'JWT_SECRET=%s\nPOSTGRES_PASSWORD=%s\n' \
  "$(openssl rand -base64 36 | tr -d '\n/+=')" \
  "$(openssl rand -base64 36 | tr -d '\n/+=')" >> .env

docker compose -f docker-compose.demo.yml up -d
./reinitialiser.sh
```

Le dépôt n'est cloné que pour ces deux fichiers : les images, elles, sont tirées
depuis GHCR comme pour une installation normale.

## Remise à zéro

```sh
0 4 * * *  cd /opt/parqueo-demo/demo && ./reinitialiser.sh >> reinit.log 2>&1
```

Le script refuse de s'exécuter si l'instance n'est pas en `DEMO_MODE` : lancé par
mégarde sur une installation de production, il détruirait toutes les données.

## Comptes

Tous avec le mot de passe `test1234`, proposés en un clic sur l'écran de
connexion :

| Compte | Rôle | Ce qu'il montre |
| --- | --- | --- |
| `admin@parqueo.local` | administrateur | workflows, inventaire, réglages, catalogue |
| `tech@parqueo.local` | technicien | file de tickets, assignation, base de connaissances |
| `user@parqueo.local` | utilisateur | dépôt d'une demande, suivi |

## Mise à jour

```sh
docker compose -f docker-compose.demo.yml pull
docker compose -f docker-compose.demo.yml up -d
```

## Ce qui reste à surveiller

- **Le disque** : les pièces jointes déposées par les visiteurs partent à la
  remise à zéro, mais s'accumulent entre deux passages. Une journée suffit
  rarement à saturer un volume ; surveillez tout de même.
- **L'indexation** : l'en-tête `X-Robots-Tag: noindex, nofollow` est posé par le
  conteneur `web`. Vérifiez-le après le premier déploiement avec
  `curl -sI https://demo.parqueo.fr/ | grep -i robots`.
