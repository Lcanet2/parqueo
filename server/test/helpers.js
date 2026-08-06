import './setup.js';
import { once } from 'node:events';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

// Outils des tests d'API : un serveur sur port éphémère, une base remise à zéro
// et un client HTTP minimal qui porte le jeton.

export async function startServer() {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { token, body, raw, headers = {} } = {}) => {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (body !== undefined) h['Content-Type'] ??= 'application/json';

    const res = await fetch(`${base}${path}`, {
      method,
      headers: h,
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const txt = await res.text();
    let data = null;
    try {
      data = txt ? JSON.parse(txt) : null;
    } catch {
      data = txt; // page HTML (satisfaction) ou corps non JSON
    }
    return { status: res.status, data, headers: res.headers };
  };

  return {
    base,
    server,
    get: (p, o) => call('GET', p, o),
    post: (p, o) => call('POST', p, o),
    patch: (p, o) => call('PATCH', p, o),
    put: (p, o) => call('PUT', p, o),
    del: (p, o) => call('DELETE', p, o),
    close: () => new Promise((r) => server.close(r)),
  };
}

// Vide la base dans l'ordre des dépendances puis pose un jeu de données minimal.
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      workflow_runs, workflow_steps, workflows,
      attachments, ticket_comments, tickets,
      software_installs, software, assets,
      form_fields, forms, kb_articles,
      settings, users, teams, categories
    RESTART IDENTITY CASCADE
  `);
}

const PASSWORD = 'motdepasse1';

export async function seedBasics() {
  const team = await prisma.team.create({ data: { name: 'Support IT' } });
  const category = await prisma.category.create({ data: { name: 'Matériel' } });
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const [admin, tech, user] = await Promise.all([
    prisma.user.create({
      data: { email: 'admin@test.local', name: 'Admin', role: 'admin', passwordHash },
    }),
    prisma.user.create({
      data: {
        email: 'tech@test.local',
        name: 'Technicien',
        role: 'technician',
        passwordHash,
        teamId: team.id,
      },
    }),
    prisma.user.create({
      data: { email: 'user@test.local', name: 'Utilisateur', role: 'user', passwordHash },
    }),
  ]);

  return { team, category, admin, tech, user, password: PASSWORD };
}

export async function login(api, email, password = PASSWORD) {
  const res = await api.post('/api/auth/login', { body: { email, password } });
  if (res.status !== 200) throw new Error(`login ${email} → ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.token;
}

export const disconnect = () => prisma.$disconnect();
export { prisma };
