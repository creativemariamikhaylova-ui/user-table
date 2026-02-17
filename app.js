const { useState, useEffect, useCallback, useMemo, useRef } = React;
const html = htm.bind(React.createElement);

const API_BASE = "https://dummyjson.com/users";
const DEBOUNCE_MS = 300;

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
  { key: "lastName", label: "Фамилия", sortKey: "lastName" },
  { key: "firstName", label: "Имя", sortKey: "firstName" },
  {
    key: "patronymic",
    label: "Отчество",
    getValue: (u) => u.maidenName || u.middleName || "—",
  },
  { key: "age", label: "Возраст", sortKey: "age" },
  { key: "gender", label: "Пол", sortKey: "gender", filterType: "select" },
  { key: "phone", label: "Телефон", sortKey: "phone" },
  { key: "email", label: "Email", sortKey: "email" },
  { key: "country", label: "Страна", getValue: (u) => u.address?.country || "—" },
  { key: "city", label: "Город", getValue: (u) => u.address?.city || "—" },
];

const FILTER_KEYS = COLUMNS.map((c) => c.key);

const EMPTY_FILTERS = Object.freeze(
  FILTER_KEYS.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {})
);

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function useUsers({ page, pageSize, sort }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.append("limit", pageSize);
    params.append("skip", (page - 1) * pageSize);

    if (sort.key && sort.order) {
      if (sort.key === "country" || sort.key === "city") {
        params.append("sortBy", "address." + sort.key);
      } else {
        params.append("sortBy", sort.key);
      }
      params.append("order", sort.order);
    }

    return `${API_BASE}?${params.toString()}`;
  }, [page, pageSize, sort]);

  const fetchUsers = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(buildUrl(), {
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err) {
      if (err.name !== "AbortError") {
        setError("Не удалось загрузить пользователей.");
      }
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    fetchUsers();
    return () => abortRef.current?.abort();
  }, [fetchUsers]);

  return { users, total, loading, error, refetch: fetchUsers };
}

const getFieldValue = (user, key) => {
  if (key === "country") return user.address?.country || "";
  if (key === "city") return user.address?.city || "";
  return user[key] ?? "";
};

const matchesFilters = (user, filters) => {
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;

    const userValue = String(getFieldValue(user, key)).toLowerCase();
    const search = String(value).toLowerCase();

    if (key === "gender") {
      if (search !== user.gender) return false;
    } else {
      if (!userValue.includes(search)) return false;
    }
  }
  return true;
};

function App() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState({ key: null, order: null });
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [selectedUser, setSelectedUser] = useState(null);
  const [columnWidths, setColumnWidths] = useLocalStorage(
    "columnWidths",
    DEFAULT_WIDTHS
  );

  const debouncedFilters = useDebounce(filters, DEBOUNCE_MS);

  const { users, total, loading, error, refetch } = useUsers({
    page,
    pageSize,
    sort,
  });

  const filteredUsers = useMemo(() => {
    if (!Object.values(debouncedFilters).some(Boolean)) return users;
    return users.filter((u) => matchesFilters(u, debouncedFilters));
  }, [users, debouncedFilters]);

  const totalPages = Math.ceil(total / pageSize);

  const toggleSort = (key) => {
    setPage(1);
    setSort((prev) => {
      if (prev.key !== key) return { key, order: "asc" };
      if (prev.order === "asc") return { key, order: "desc" };
      if (prev.order === "desc") return { key: null, order: null };
      return { key, order: "asc" };
    });
  };

  const sortLabel = (key) => {
    if (sort.key !== key || !sort.order) return "—";
    return sort.order === "asc" ? "↑" : "↓";
  };

  const resizeRef = useRef(null);

  const startResize = (key, event) => {
    event.preventDefault();

    const handleMove = (e) => {
      requestAnimationFrame(() => {
        const delta = e.clientX - resizeRef.current.startX;
        const newWidth = Math.max(50, resizeRef.current.startWidth + delta);
        setColumnWidths((prev) => ({ ...prev, [key]: newWidth }));
      });
    };

    const handleUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    resizeRef.current = {
      startX: event.clientX,
      startWidth: columnWidths[key] || DEFAULT_WIDTHS[key] || 120,
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return html`
    <div className="page">
      <header className="header">
        <h1 className="title">Таблица пользователей</h1>
        <p className="subtitle">Данные из DummyJSON • Кликните по строке для подробностей</p>
      </header>

      <section className="panel">
        <div className="toolbar">
          <div className="status">
            ${loading ? "Загрузка..." : `Показано ${filteredUsers.length} из ${total}`}
            ${sort.key && sort.order ? ` • Сортировка: ${sort.key} (${sort.order === 'asc' ? 'возрастание' : 'убывание'})` : ""}
          </div>
          <div className="actions">
            <button className="button" onClick=${() => {
              setFilters({ ...EMPTY_FILTERS });
              setPage(1);
            }}>
              Сбросить фильтры
            </button>
            <button className="button primary" onClick=${refetch}>
              Обновить
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                ${COLUMNS.map((col) => {
                  const width = columnWidths[col.key] || DEFAULT_WIDTHS[col.key];
                  return html`
                    <th style=${{ width }} key=${col.key}>
                      <div className="th-content">
                        <div className="th-header">
                          ${col.sortKey
                            ? html`
                                <button
                                  className="sort-btn ${sort.key === col.sortKey ? 'active' : ''}"
                                  onClick=${() => toggleSort(col.sortKey)}
                                >
                                  ${col.label}
                                  <span className="sort-icon">${sortLabel(col.sortKey)}</span>
                                </button>
                              `
                            : html`<span className="th-label">${col.label}</span>`}
                        </div>
                        <div className="filter-cell">
                          ${col.filterType === "select"
                            ? html`
                                <select
                                  value=${filters[col.key]}
                                  onChange=${(e) =>
                                    setFilters((prev) => ({
                                      ...prev,
                                      [col.key]: e.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Все</option>
                                  <option value="male">Мужской</option>
                                  <option value="female">Женский</option>
                                </select>
                              `
                            : html`
                                <input
                                  type="text"
                                  placeholder="Фильтр"
                                  value=${filters[col.key]}
                                  onChange=${(e) =>
                                    setFilters((prev) => ({
                                      ...prev,
                                      [col.key]: e.target.value,
                                    }))
                                  }
                                />
                              `}
                        </div>
                      </div>
                      <span
                        className="resizer"
                        onMouseDown=${(e) => startResize(col.key, e)}
                      />
                    </th>
                  `;
                })}
              </tr>
            </thead>
            <tbody>
              ${loading
                ? html`<tr><td colSpan=${COLUMNS.length} className="loading-cell">Загрузка данных...</td></tr>`
                : filteredUsers.length === 0
                  ? html`<tr><td colSpan=${COLUMNS.length} className="empty-cell">Пользователи не найдены</td></tr>`
                  : filteredUsers.map(
                      (user) => html`
                        <tr
                          key=${user.id}
                          onClick=${() => setSelectedUser(user)}
                          className="clickable-row"
                        >
                          ${COLUMNS.map((col) => {
                            const val = col.getValue ? col.getValue(user) : user[col.key];
                            return html`
                              <td style=${{ width: columnWidths[col.key] }} key=${col.key}>
                                ${val === "" ? "—" : val}
                              </td>
                            `;
                          })}
                        </tr>
                      `
                    )}
            </tbody>
          </table>
        </div>

        <nav className="pagination">
          <button disabled=${page === 1} onClick=${() => setPage(1)}>«</button>
          <button disabled=${page === 1} onClick=${() => setPage(page - 1)}>‹</button>
          <span className="page-info">Страница ${page} из ${totalPages || 1}</span>
          <button disabled=${page === totalPages} onClick=${() => setPage(page + 1)}>›</button>
          <button disabled=${page === totalPages} onClick=${() => setPage(totalPages)}>»</button>
          <select
            value=${pageSize}
            onChange=${(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            ${[5, 10, 20, 50].map((n) => html`<option value=${n}>${n}</option>`)}
          </select>
        </nav>

        ${error && html`<div className="error" role="alert">${error}</div>`}
      </section>

      ${selectedUser && html`
        <div className="modal-backdrop" onClick=${() => setSelectedUser(null)}>
          <div className="modal" onClick=${(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">${selectedUser.firstName} ${selectedUser.lastName}</h2>
              <button className="modal-close" onClick=${() => setSelectedUser(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-avatar">
                <img 
                  src=${selectedUser.image} 
                  alt="${selectedUser.firstName} ${selectedUser.lastName}"
                  className="avatar"
                  onError=${(e) => {
                    e.target.onerror = null;
                    e.target.src = "https://via.placeholder.com/120?text=No+Image";
                  }}
                />
              </div>
              <div className="modal-info">
                <div className="info-section">
                  <h3>Основная информация</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">Возраст:</span>
                      <span className="info-value">${selectedUser.age} лет</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Пол:</span>
                      <span className="info-value">${selectedUser.gender === 'male' ? 'Мужской' : 'Женский'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Рост:</span>
                      <span className="info-value">${selectedUser.height} см</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Вес:</span>
                      <span className="info-value">${selectedUser.weight} кг</span>
                    </div>
                  </div>
                </div>
                <div className="info-section">
                  <h3>Контакты</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">Телефон:</span>
                      <span className="info-value">${selectedUser.phone}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Email:</span>
                      <span className="info-value email-value">${selectedUser.email}</span>
                    </div>
                  </div>
                </div>
                <div className="info-section">
                  <h3>Адрес</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">Страна:</span>
                      <span className="info-value">${selectedUser.address?.country || '—'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Город:</span>
                      <span className="info-value">${selectedUser.address?.city || '—'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Улица:</span>
                      <span className="info-value">${selectedUser.address?.address || '—'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Индекс:</span>
                      <span className="info-value">${selectedUser.address?.postalCode || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `}
    </div>
  `;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(html`<${App} />`);
