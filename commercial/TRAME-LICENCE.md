# Trame de licence commerciale Parqueo

> **Ceci n'est pas un contrat.** C'est une trame de travail destinée à être
> relue et complétée par un avocat avant toute signature. Elle recense les
> points à trancher, propose une rédaction de départ pour chacun, et signale
> les pièges propres au double licenciement d'un logiciel AGPL.
>
> Les crochets `[…]` marquent ce qui reste à décider.

---

## 1. Pourquoi cette licence existe

Parqueo est publié sous **AGPL-3.0**. Cette licence accorde à quiconque reçoit
le logiciel le droit de l'exécuter, de le modifier et de le redistribuer, sans
contrepartie financière. Elle impose en échange une obligation :

> Quiconque **met le logiciel modifié à disposition de tiers par le réseau**
> doit mettre le code source correspondant, modifications comprises, à
> disposition de ces tiers, sous la même licence.

Cette obligation est sans conséquence pour l'entreprise qui installe Parqueo
pour son propre usage interne. Elle en a une, en revanche, pour :

- le **prestataire informatique** qui exploite Parqueo pour le compte de ses
  clients ;
- l'**éditeur** qui intègre Parqueo dans une offre propriétaire ;
- le **revendeur** qui le propose en marque blanche.

La licence commerciale est l'alternative proposée à ces trois profils : elle
lève l'obligation de publication, en échange d'une redevance.

**Le double licenciement n'est possible que parce que Léo Canet détient seul le
droit d'auteur sur le code.** Cette condition doit rester vraie — voir §7.

---

## 2. Ce que la licence commerciale accorde

| Droit | Portée proposée |
| --- | --- |
| Usage interne | Illimité, sans limite de comptes ni de durée pendant la validité |
| Exploitation pour des tiers | Autorisée, **sans obligation de publier les modifications** |
| Modification du code | Autorisée, y compris sans reversement |
| Redistribution du code source | `[à trancher : interdite, ou autorisée aux seuls clients finaux]` |
| Marque blanche | `[à trancher : incluse, ou option facturée séparément]` |
| Sous-licence à des tiers | `[à trancher — par défaut : interdite]` |

**Point à ne pas manquer.** Si la licence commerciale autorise le licencié à
redistribuer le code, le destinataire reçoit-il l'AGPL ou la licence
commerciale ? Sans clause explicite, l'ambiguïté profite au licencié. La
rédaction par défaut recommandée : *aucune redistribution du code source hors
des cas expressément prévus.*

---

## 3. Ce qu'elle n'accorde pas

À énumérer explicitement — ce qui n'est pas exclu est réputé accordé :

- Aucune cession du droit d'auteur ni de la marque « Parqueo ».
- Aucun droit d'usage du nom ou de l'identité visuelle en dehors de
  `[mention « Propulsé par Parqueo », à définir]`.
- Aucune exclusivité territoriale ou sectorielle, sauf accord distinct.
- Aucun engagement de maintenance : celui-ci relève du contrat de support, qui
  est un contrat séparé (voir §6).

---

## 4. Assiette et durée

L'assiette détermine ce qu'on facture. Trois modèles courants :

| Modèle | Assiette | Convient à |
| --- | --- | --- |
| Par instance déployée | Une redevance par installation chez un client final | Intégrateurs à faible volume |
| Par client final géré | Une redevance par organisation servie | Infogéreurs — assiette la plus lisible |
| Forfait annuel illimité | Un montant fixe, quel que soit le volume | Gros prestataires, revente en marque blanche |

`[à trancher : modèle retenu et montants]`

**Durée.** Abonnement annuel reconductible, plutôt que licence perpétuelle : la
licence perpétuelle supprime le revenu récurrent et rend la fin de relation
impossible à gérer.

**Point critique — que se passe-t-il à l'échéance ?** Si le licencié cesse de
payer :

- il **perd** le droit d'exploiter les versions futures ;
- pour les versions déjà déployées, deux options : `[extinction du droit
  d'exploitation à l'échéance]` ou `[retour au régime AGPL, donc obligation de
  publier ses modifications]`.

La seconde est la plus dissuasive et la plus simple à défendre : elle ne prive
personne d'un logiciel en production, elle rétablit seulement l'obligation de
publication.

---

## 5. Périmètre de version

À préciser sans ambiguïté :

- La licence couvre-t-elle **toutes** les versions publiées pendant la période,
  ou seulement la branche `[X.Y]` ?
- Une version majeure ouvre-t-elle droit à une renégociation ?

Formulation de départ : *la licence couvre toutes les versions publiées pendant
la période de validité, mises à jour majeures comprises.* Simple, et cohérent
avec un abonnement annuel.

---

## 6. Ce qui doit rester en dehors

Trois contrats distincts, à ne pas fondre en un seul :

1. **La licence commerciale** — un droit d'usage. Pas d'obligation de moyens.
2. **Le contrat de support** — délais de réponse, canaux, plages horaires,
   pénalités. C'est lui qui porte les engagements de service.
3. **Les prestations** — mise en service, migration, formation. Devis au
   forfait ou en régie.

Les fondre expose à ce qu'un manquement de support fasse tomber le droit
d'usage, ou l'inverse.

---

## 7. Points de vigilance juridique

À soumettre à l'avocat, dans cet ordre d'importance :

1. **Titularité des droits.** Le double licenciement suppose que vous soyez
   seul titulaire. Dès la première contribution externe acceptée sur GitHub,
   ce n'est plus vrai : le contributeur conserve ses droits sur son apport, et
   vous ne pouvez plus le relicencier en commercial. **Il faut un accord de
   contribution (CLA ou DCO avec cession) avant d'accepter la première
   contribution.** C'est le point le plus urgent, et il ne coûte rien
   aujourd'hui.

2. **Garantie et responsabilité.** L'AGPL exclut toute garantie. Une licence
   commerciale payante ne peut pas exclure aussi largement en droit français :
   la clause doit être plafonnée, pas supprimée.

3. **Composants tiers.** Les dépendances (Node.js, PostgreSQL, Prisma, React,
   Caddy, et l'arbre npm) portent leurs propres licences. Vous ne pouvez
   accorder que ce que ces licences vous permettent de transmettre. Un audit
   des licences transitives est à faire une fois, puis à surveiller.

4. **Droit applicable et juridiction.** À fixer explicitement.

5. **Audit.** Prévoir un droit de vérification du nombre d'instances ou de
   clients déclarés, avec préavis raisonnable.

---

## 8. Ce qu'il faut préparer en parallèle

- Une page publique décrivant l'offre — faite : `parqueo.fr/services`.
- Un modèle de devis reprenant l'assiette retenue au §4.
- Un accord de contribution, **avant** d'ouvrir les contributions externes
  (§7.1).
- Une politique de version, pour que « la branche X.Y » ait un sens (§5).

---

*Document de travail, à faire relire par un conseil juridique. Il ne constitue
pas un avis juridique et n'engage personne.*
