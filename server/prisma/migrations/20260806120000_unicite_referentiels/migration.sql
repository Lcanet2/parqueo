-- Unicité des noms de référentiels.
-- Deux catégories ou deux équipes homonymes rendaient les filtres et les
-- conditions de workflow ambigus. Les doublons éventuels sont d'abord fusionnés
-- vers l'occurrence la plus ancienne, pour ne perdre aucune donnée liée.

-- Catégories
UPDATE tickets t SET category_id = c.garde
  FROM (SELECT name, MIN(id) AS garde FROM categories GROUP BY name) c
  JOIN categories d ON d.name = c.name AND d.id <> c.garde
  WHERE t.category_id = d.id;
UPDATE forms f SET category_id = c.garde
  FROM (SELECT name, MIN(id) AS garde FROM categories GROUP BY name) c
  JOIN categories d ON d.name = c.name AND d.id <> c.garde
  WHERE f.category_id = d.id;
UPDATE kb_articles k SET category_id = c.garde
  FROM (SELECT name, MIN(id) AS garde FROM categories GROUP BY name) c
  JOIN categories d ON d.name = c.name AND d.id <> c.garde
  WHERE k.category_id = d.id;
DELETE FROM categories WHERE id NOT IN (SELECT MIN(id) FROM categories GROUP BY name);

-- Équipes
UPDATE tickets t SET team_id = e.garde
  FROM (SELECT name, MIN(id) AS garde FROM teams GROUP BY name) e
  JOIN teams d ON d.name = e.name AND d.id <> e.garde
  WHERE t.team_id = d.id;
UPDATE users u SET team_id = e.garde
  FROM (SELECT name, MIN(id) AS garde FROM teams GROUP BY name) e
  JOIN teams d ON d.name = e.name AND d.id <> e.garde
  WHERE u.team_id = d.id;
DELETE FROM teams WHERE id NOT IN (SELECT MIN(id) FROM teams GROUP BY name);

CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");
