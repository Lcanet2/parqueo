import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Select, Spinner, Card, EmptyState } from '../components/ui.jsx';
import { Pagination, usePaged } from '../components/Pagination.jsx';
import { formatDate } from '../lib/labels.js';

// Base de connaissances : liste + recherche. Les brouillons ne sont renvoyés
// par l'API qu'au staff, qui les voit marqués « Brouillon ».
export default function Kb() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isStaff = user.role !== 'user';

  const [articles, setArticles] = useState(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get('/categories').then(setCategories);
  }, []);

  // Recherche avec debounce pour ne pas requêter à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => {
      const query = new URLSearchParams();
      if (q.trim()) query.set('q', q.trim());
      if (category) query.set('categoryId', category);
      api.get(`/kb?${query}`).then(setArticles);
    }, 300);
    return () => clearTimeout(t);
  }, [q, category]);

  const paged = usePaged(articles ?? []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Aide &amp; solutions</h1>
        {isStaff && (
          <Button variant="primary" onClick={() => navigate('/aide/nouveau')}>
            Nouvel article
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="min-w-40 flex-1">
          <Input
            placeholder="Rechercher une solution…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">
          <option value="">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      <Card>
        {articles === null ? (
          <Spinner />
        ) : articles.length === 0 ? (
          <EmptyState>
            Aucun article{q ? ' ne correspond à cette recherche' : ' pour le moment'}
          </EmptyState>
        ) : (
          <>
            <ul>
              {paged.pageRows.map((a) => (
                <li key={a.id} className="border-b border-line last:border-0">
                  <Link to={`/aide/${a.id}`} className="block px-4 py-3 hover:bg-canvas">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-ink">{a.title}</span>
                      {!a.published && (
                        <span className="rounded bg-canvas px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-ink-soft">
                          Brouillon
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{a.body}</p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {a.category ? `${a.category.name} · ` : ''}mis à jour le {formatDate(a.updatedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              total={paged.total}
              page={paged.page}
              pageSize={paged.pageSize}
              onPage={paged.setPage}
              onPageSize={paged.setPageSize}
              unit="article"
            />
          </>
        )}
      </Card>
    </div>
  );
}
