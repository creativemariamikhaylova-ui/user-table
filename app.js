const useState = React.useState;
const useEffect = React.useEffect;
const useCallback = React.useCallback;
const useMemo = React.useMemo;
const useRef = React.useRef;
const html = htm.bind(React.createElement);

const DEFAULT_WIDTHS = {
  lastName: 150,
  firstName: 140,
  patronymic: 160,
  age: 90,
  gender: 100,
  phone: 180,
  email: 240,
  country: 160,
  city: 160,
};

const COLUMNS = [
  { key: "lastName", label: "Фамилия", sortKey: "fio" },
  { key: "firstName", label: "Имя", sortKey: "fio" },
  { 
    key: "patronymic", 
    label: "Отчество", 
    sortKey: "fio",
    getValue: (u) => u.maidenName || u.middleName || "—",
  },
  { key: "age", label: "Возраст", sortKey: "age", numeric: true },
  { key: "gender", label: "Пол", sortKey: "gender", filterType: "select" },
  { key: "phone", label: "Телефон", sortKey: "phone" },
  { key: "email", label: "Email" },
  { key: "country", label: "Страна", getValue: (u) => u.address?.country || "" },
  { key: "city", label: "Город", getValue: (u) => u.address?.city || "" },
];

const FILTER_KEYS = COLUMNS.map((c) => c.key);

const EMPTY_FILTERS = Object.freeze(
  FILTER_KEYS.reduce((acc, key) => { acc[key] = ""; return acc; }, {})
);

const DEBOUNCE_MS = 300;
const API_BASE = "https://dummyjson.com/users";

const getFieldValue = (user, key) => {
  if (key === "country") return user.address?.country || "";
  if (key === "city") return user.address?.city || "";
  if (key === "patronymic") return user.maidenName || user.middleName || "—";
  return user[key] ?? "";
};

const normalizeGenderQuery = (value) => {
  const n = String(value).trim().toLowerCase();
  if (!n) return "";
  if (["м", "m", "male"].includes(n)) return "male";
  if (["ж", "f", "female"].includes(n)) return "female";
  return n;
};

const getFullName = (user) => {
  const patronymic = user.maidenName || user.middleName || "";
  return `${user.lastName} ${user.firstName} ${patronymic}`.trim().toLowerCase();
};

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function UserModal({ user, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!user) return null;

  return html`
    <div className="modal-backdrop" onClick=${onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick=${(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              ${user.lastName} ${user.firstName} ${user.maidenName}
            </div>
            <span className="badge">
              ${user.gender === "male" ? "Мужчина" : "Женщина"}, ${user.age} лет
            </span>
          </div>
          <button className="button close-btn" type="button" onClick=${onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="modal-grid">
          <div>
            <div className="label">Телефон</div>
            <div>${user.phone}</div>
          </div>
          <div>
            <div className="label">Email</div>
            <div>${user.email}</div>
          </div>
          <div>
            <div className="label">Рост / Вес</div>
            <div>${user.height} см · ${user.weight} кг</div>
          </div>
          <div>
            <div className="label">Адрес</div>
            <div>${user.address?.address || "—"}</div>
            <div>${user.address?.city || "—"}, ${user.address?.state || "—"}</div>
            <div>${user.address?.country || "—"}, ${user.address?.postalCode || "—"}</div>
          </div>
          <div>
            <img className="avatar" src=${user.image} alt="Аватар" loading="lazy" />
          </div>
        </div>
      </div>
    </div>
  `;
}

function App() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState({ key: null, order: null });
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [selectedUser, setSelectedUser] = useState(null);
  const [columnWidths, setColumnWidths] = useState({ ...DEFAULT_WIDTHS });
  const resizeRef = useRef(null);
  const abortRef = useRef(null);

  const debouncedFilters = useDebounce(filters, DEBOUNCE_MS);

  const filtersActive = useMemo(
    () => FILTER_KEYS.some((k) => String(debouncedFilters[k]).trim() !== ""),
    [debouncedFilters]
  );

  const buildApiUrl = useCallback(() => {
    const activeFilters = Object.entries(debouncedFilters)
      .filter(([_, v]) => v.trim() !== "");
    
    let url;
    
    if (activeFilters.length > 0) {
      url = `${API_BASE}/filter?limit=${pageSize}&skip=${(page - 1) * pageSize}`;
      
      activeFilters.forEach(([key, value]) => {
        if (key === 'gender') {
          const genderValue = normalizeGenderQuery(value);
          if (genderValue) {
            url += `&key=gender&value=${genderValue}`;
          }
        } else if (key === 'country') {
          url += `&key=address.country&value=${encodeURIComponent(value)}`;
        } else if (key === 'city') {
          url += `&key=address.city&value=${encodeURIComponent(value)}`;
        } else {
          url += `&key=${key}&value=${encodeURIComponent(value)}`;
        }
      });
      
      if (sort.key && sort.order && sort.key !== 'fio') {
        url += `&sortBy=${sort.key}&order=${sort.order}`;
      }
    } else {
      url = `${API_BASE}?limit=${pageSize}&skip=${(page - 1) * pageSize}`;
      
      if (sort.key && sort.order && sort.key !== 'fio') {
        url += `&sortBy=${sort.key}&order=${sort.order}`;
      }
    }
    
    return url;
  }, [page, pageSize, sort.key, sort.order, debouncedFilters]);

  const fetchUsers = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const url = buildApiUrl();
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      let usersData = [];
      let totalCount = 0;
      
      if (data.users) {
        usersData = data.users;
        totalCount = data.total;
      } else if (Array.isArray(data)) {
        usersData = data;
        totalCount = data.length;
      }
      
      if (sort.key === 'fio' && sort.order && usersData.length > 0) {
        usersData = [...usersData].sort((a, b) => {
          const fioA = getFullName(a);
          const fioB = getFullName(b);
          
          if (sort.order === 'asc') {
            return fioA.localeCompare(fioB);
          } else {
            return fioB.localeCompare(fioA);
          }
        });
      }
      
      setUsers(usersData);
      setTotal(totalCount);
    } catch (err) {
      if (err.name !== "AbortError") {
        setError("Не удалось загрузить пользователей. Проверьте соединение и повторите попытку.");
      }
    } finally {
      setLoading(false);
    }
  }, [buildApiUrl, sort.key, sort.order]);

  useEffect(() => {
    fetchUsers();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchUsers]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleSort = useCallback((key) => {
    setPage(1);
    setSort((prev) => {
      if (prev.key !== key) return { key, order: "asc" };
      if (prev.order === "asc") return { key, order: "desc" };
      return { key: null, order: null };
    });
  }, []);

  const sortLabel = useCallback(
    (key) => {
      if (sort.key !== key || !sort.order) return "—";
      return sort.order === "asc" ? "↑" : "↓";
    },
    [sort]
  );

  const updateFilter = useCallback((key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ ...EMPTY_FILTERS });
    setPage(1);
  }, []);

  const closeModal = useCallback(() => setSelectedUser(null), []);

  const startResize = useCallback(
    (key, event) => {
      event.preventDefault();
      const handleMove = (e) => {
        const cur = resizeRef.current;
        if (!cur) return;
        const delta = e.clientX - cur.startX;
        setColumnWidths((prev) => ({ ...prev, [cur.key]: Math.max(50, cur.startWidth + delta) }));
      };
      const handleUp = () => {
        resizeRef.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
      resizeRef.current = {
        key,
        startX: event.clientX,
        startWidth: columnWidths[key] || DEFAULT_WIDTHS[key] || 120,
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [columnWidths]
  );

  return html`
    <div className="page">
      <header className="header">
        <h1 className="title">Таблица пользователей</h1>
        <p className="subtitle">
          Сортировка, фильтрация и постраничная навигация. Кликните строку, чтобы открыть карточку пользователя.
        </p>
      </header>

      <section className="panel">
        <div className="toolbar">
          <div className="status" aria-live="polite">
            ${loading ? "Загрузка данных..." : `Показано ${users.length} из ${total} пользователей`}
          </div>
          <div className="actions">
            <button className="button" type="button" onClick=${resetFilters} disabled=${!filtersActive}>
              Сбросить фильтры
            </button>
            <button className="button primary" type="button" onClick=${fetchUsers} disabled=${loading}>
              Обновить
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table" role="grid">
            <thead>
              <tr>
                ${COLUMNS.map((col) => {
                  const width = columnWidths[col.key];
                  return html`
                    <th key=${col.key} style=${{ width }}>
                      <div className="th-content">
                        ${col.sortKey ? html`
                          <button 
                            className="sort-btn" 
                            type="button" 
                            onClick=${() => toggleSort(col.sortKey)}
                            aria-sort=${sort.key === col.sortKey ? sort.order : 'none'}
                          >
                            ${col.label}
                            <span className="sort-icon" aria-hidden="true">${sortLabel(col.sortKey)}</span>
                          </button>
                        ` : col.label}
                        
                        <div className="filter-cell">
                          ${col.filterType === "select" ? html`
                            <select 
                              value=${filters[col.key] || ''} 
                              onChange=${(e) => updateFilter(col.key, e.target.value)}
                              onClick=${(e) => e.stopPropagation()}
                            >
                              <option value="">Все</option>
                              <option value="male">М</option>
                              <option value="female">Ж</option>
                            </select>
                          ` : html`
                            <input
                              type="text"
                              placeholder="Фильтр..."
                              value=${filters[col.key] || ''}
                              onChange=${(e) => updateFilter(col.key, e.target.value)}
                              onClick=${(e) => e.stopPropagation()}
                            />
                          `}
                        </div>
                      </div>
                      <span className="resizer" onMouseDown=${(e) => startResize(col.key, e)} />
                    </th>
                  `;
                })}
              </tr>
            </thead>
            <tbody>
              ${loading
                ? html`<tr><td colSpan=${COLUMNS.length} className="empty">Загрузка...</td></tr>`
                : users.length === 0
                  ? html`<tr><td colSpan=${COLUMNS.length} className="empty">Нет данных по выбранным фильтрам.</td></tr>`
                  : users.map((user) => html`
                    <tr key=${user.id} onClick=${() => setSelectedUser(user)}>
                      ${COLUMNS.map((col) => {
                        const val = col.getValue ? col.getValue(user) : user[col.key];
                        const display = col.key === "gender" 
                          ? (val === "male" ? "М" : val === "female" ? "Ж" : val)
                          : val;
                        return html`<td key=${col.key} style=${{ width: columnWidths[col.key] }}>${display}</td>`;
                      })}
                    </tr>
                  `)}
            </tbody>
          </table>
        </div>

        <nav className="pagination" aria-label="Навигация по страницам">
          <button type="button" onClick=${() => setPage(1)} disabled=${page === 1} aria-label="Первая страница">«</button>
          <button type="button" onClick=${() => setPage((p) => Math.max(1, p - 1))} disabled=${page === 1} aria-label="Предыдущая страница">‹</button>
          <span className="page-info">Страница ${page} из ${totalPages}</span>
          <button type="button" onClick=${() => setPage((p) => Math.min(totalPages, p + 1))} disabled=${page === totalPages} aria-label="Следующая страница">›</button>
          <button type="button" onClick=${() => setPage(totalPages)} disabled=${page === totalPages} aria-label="Последняя страница">»</button>
          <label className="page-info">
            Показать по 
            <select value=${pageSize} onChange=${(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              ${[5, 10, 20, 50].map((s) => html`<option key=${s} value=${s}>${s}</option>`)}
            </select>
          </label>
        </nav>

        ${error ? html`<div className="error" role="alert">${error}</div>` : null}
      </section>

      ${selectedUser ? html`<${UserModal} user=${selectedUser} onClose=${closeModal} />` : null}
    </div>
  `;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
