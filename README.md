# Parqueo

**ITSM auto-hébergé pour PME.** Tickets, gestion de parc, catalogue de demandes
et workflows visuels — sans l'usine à gaz.

Parqueo tourne sur **votre** serveur (Node.js + PostgreSQL) : les données de vos
utilisateurs, de votre parc et de vos incidents ne quittent pas votre
infrastructure. L'objectif tient en une phrase : trois fonctionnalités qui
marchent bien plutôt que dix à moitié faites, et une prise en main sans
formation.

[parqueo.fr](https://parqueo.fr) · [Documentation](https://parqueo.fr/docs/)

![Liste des tickets dans Parqueo](https://parqueo.fr/docs/img/liste-tickets.png)

---

## Ce que ça fait

| | |
| --- | --- |
| **Ticketing** | Création libre ou par formulaire, conversation, pièces jointes, priorités, équipes, assignation, clôture automatique, enquête de satisfaction en un clic |
| **Gestion de parc** | Saisie manuelle **ou** inventaire automatique : agent GLPI, connecteur Microsoft Intune (sans agent), scan réseau SNMP (imprimantes, switches, NAS) |
| **Catalogue de demandes** | Formulaires configurables qui deviennent des tickets qualifiés — un Formcreator intégré au cœur |
| **Workflows visuels** | Éditeur à blocs : déclencheur, conditions, actions, branches oui/non et blocs d'attente. Un ticket peut rester parqué sur « en attente de prise en charge » puis repartir tout seul |
| **Base de connaissances** | Articles courts, suggérés pendant la saisie d'un ticket pour éviter la demande |
| **Tableaux de bord** | Widgets configurables par rôle, personnalisables par compte si l'administration l'autorise |
| **Connexion** | Comptes locaux ou SSO Microsoft Entra ID (provisioning automatique à la première connexion) |
| **Email** | Notifications sortantes, et collecteur IMAP : un email devient un ticket, une réponse devient un commentaire |

---

## Installer en une commande

Prérequis : Docker avec le plugin Compose. Ni git, ni Node, ni les sources.

```sh
curl -fsSL https://parqueo.fr/install.sh | sh
```

Avec un nom de domaine, le certificat HTTPS est obtenu et renouvelé tout seul :

```sh
curl -fsSL https://parqueo.fr/install.sh | sh -s -- --domaine support.entreprise.fr
```

Puis ouvrez l'adresse indiquée : **le premier écran vous fait créer votre compte
administrateur**. Parqueo n'est livré avec aucun mot de passe par défaut.

L'installeur tire les images publiées, génère les secrets, lance PostgreSQL,
applique les migrations et sert le client derrière Caddy sur la même origine que
l'API.

| | |
| --- | --- |
| Mettre à jour | `docker compose pull && docker compose up -d` |
| Sauvegarder | `docker compose exec -T db pg_dump -U parqueo parqueo \| gzip > parqueo.sql.gz` |
| Arrêter | `docker compose down` — les données restent dans les volumes |
| Tout effacer | `docker compose down -v` |

Pour l'exploitation au quotidien (sauvegardes planifiées, supervision,
restauration), suivez la
[documentation d'installation](https://parqueo.fr/docs/installation/).

---

## Documentation

En ligne sur **[parqueo.fr/docs](https://parqueo.fr/docs/)**, également disponible en PDF.

| Document | Pour qui |
| -------- | -------- |
| [Documentation fonctionnelle](https://parqueo.fr/docs/fonctionnel/) | Utilisateurs, techniciens, administrateurs — ce que fait le logiciel, écran par écran |
| [Documentation d'installation](https://parqueo.fr/docs/installation/) | La personne qui déploie et exploite : prérequis, nginx, systemd, variables d'environnement, sauvegarde, dépannage |
| [Documentation technique](https://parqueo.fr/docs/technique/) | Développeurs — architecture, modèle de données, API HTTP, moteur de workflows, sécurité |

Les sources (Markdown, captures d'écran, générateurs PDF et web) vivent dans le
dépôt `parqueo-docs`, séparé de celui-ci : la documentation évolue à son propre
rythme et n'alourdit pas le clone du logiciel.

---

## Développement

Prérequis : Node.js 20+ (22 recommandé) et PostgreSQL 14+.

```sh
# API
cd server
npm ci
cp .env.example .env          # renseigner DATABASE_URL et JWT_SECRET
npx prisma migrate deploy
npm run seed                  # catégorie et équipe par défaut, aucun compte
npm run dev                   # http://localhost:4000

# Client (dans un autre terminal)
cd client
npm ci
npm run dev                   # http://localhost:5173, /api proxifié vers :4000
```

### Tests

Pas de framework : le lanceur intégré `node --test`.

```sh
cd server
npm test                      # logique pure, aucune base requise
createdb parqueo_test         # une seule fois
DATABASE_URL="postgresql://…/parqueo_test" npx prisma migrate deploy
npm run test:api              # API de bout en bout sur un serveur éphémère
npm run test:all              # les deux

cd ../client
npm test                      # client d'API : jeton, 401, erreurs réseau
npm run lint
npm run build
```

Les tests d'API tournent sur une base séparée (`parqueo_test` par défaut,
surchargeable par `TEST_DATABASE_URL`) qu'ils vident entre les fichiers. Un
garde-fou refuse toute base dont le nom ne contient pas « test ».

### Organisation

```
server/
  src/routes/      un routeur par domaine (pas de couche controller/service séparée)
  src/services/    logique métier avec effets de bord (workflows, emails, connecteurs)
  src/lib/         helpers purs, testables sans base
  prisma/          schéma et migrations
client/
  src/pages/       une page par route
  src/components/  briques d'interface partagées
docker/            Caddyfile de l'image web
install.sh         installeur : télécharge, génère les secrets, démarre
docker-compose.prod.yml  stack de production (images publiées)
docker-compose.yml       stack construite depuis les sources, pour développer
```

Le premier compte se crée depuis l'interface (`POST /api/setup`), et cette route
se referme dès qu'un compte existe.

---

## Licence

Parqueo est distribué sous **[GNU Affero General Public License v3.0](LICENSE)**
(AGPL-3.0).

Concrètement :

- **Vous l'installez chez vous, on-premise** — aucune obligation. Utilisez-le,
  modifiez-le, adaptez-le à votre organisation, tant que vous ne le redistribuez
  pas ni ne l'exposez comme service à des tiers.
- **Vous le proposez comme service à des tiers (SaaS)** — l'AGPL vous oblige
  alors à mettre vos modifications à disposition de vos utilisateurs, sous la
  même licence.

**Licence commerciale.** Si l'AGPL est incompatible avec votre modèle
(intégration dans un produit propriétaire, revente en marque blanche, SaaS sans
publication des modifications), une licence commerciale est disponible :
[contact@parqueo.fr](mailto:contact@parqueo.fr).

« Parqueo » est le nom du projet ; la licence porte sur le code, pas sur le nom
ni sur l'identité visuelle.

Copyright © 2026 Léo Canet.
