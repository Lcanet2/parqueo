// Parseur CSV minimal mais correct : gère les champs entre guillemets (donc les
// virgules et retours à la ligne échappés) et les guillemets doublés. Renvoie un
// tableau d'objets indexés par l'en-tête (première ligne), normalisé.

// Alias d'en-tête acceptés → clés attendues par l'API d'import.
const ALIAS = {
  nom: 'name',
  name: 'name',
  email: 'email',
  'e-mail': 'email',
  mail: 'email',
  role: 'role',
  rôle: 'role',
  equipe: 'team',
  équipe: 'team',
  team: 'team',
  'mot de passe': 'password',
  mdp: 'password',
  password: 'password',
};

function tokenize(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',' || c === ';') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseCsv(text) {
  const rows = tokenize(text ?? '');
  if (!rows.length) return [];
  const header = rows[0].map((h) => {
    const key = h.trim().toLowerCase();
    return ALIAS[key] ?? key;
  });
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}
