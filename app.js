const { useEffect, useMemo, useRef, useState } = React;
const html = htm.bind(React.createElement);

const SORT_FIELDS = {
  fio: "lastName",
  age: "age",
  gender: "gender",
  phone: "phone",
};

const DEFAULT_WIDTHS = {
  lastName: 150,
  firstName: 140,
  maidenName: 160,
  age: 90,
  gender: 100,
  phone: 180,
  email: 240,
  country: 160,
  city: 160,
};

const COLUMNS = [
  { key: "lastName", label: "Фамилия" },
  { key: "firstName", label: "Имя" },
  { key: "maidenName", label: "Отчество" },
  { key: "age", label: "Возраст", numeric: true },
  { key: "gender", label: "Пол" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "country", label: "Страна", getValue: (user) => user.address?.country || "" },
  { key: "city", label: "Город", getValue: (user) => user.address?.city || "" },
];

const FILTER_KEYS = [
  "lastName",
  "firstName",
  "maidenName",
  "age",
  "gender",
  "phone",
  "email",
  "country",
  "city",
];

function App() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState({ key: null, order: null });
  const [filters, setFilters] = useState(
    FILTER_KEYS.reduce((acc, key) => {
      acc[key] = "";
      return acc;
    }, {})
  );
  const [selectedUser, setSelectedUser] = useState(null);
  const [columnWidths, setColumnWidths] = useState({ ...DEFAULT_WIDTHS });
  const resizeRef = useRef(null);
  const abortRef = useRef(null);

  const filtersActive = useMemo(
    () => FILTER_KEYS.some((key) => String(filters[key]).trim() !== ""),
    [filters]
  );

  const displayUsers = useMemo(() => users, [users]);

  useEffect(() => {
    fetchUsers();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [page, pageSize, sort, filters]);

  const fetchUsers = async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams();
    const sortBy = sort.key ? SORT_FIELDS[sort.key] : null;
    if (sortBy && sort.order) {
      params.set("sortBy", sortBy);
      params.set("order", sort.order);
    }

    // Исправлено: всегда запрашиваем всех пользователей, чтобы получать больше 50
    params.set("limit", 0);

    const url = `https://dummyjson.com/users?${params.toString()}`;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      let fetched = Array.isArray(data.users) ? data.users : [];
      
      // Применяем фильтры на клиенте
      let filtered = fetched;
      if (filtersActive) {
        filtered = applyFilters(fetched, filters);
      }
      
      // Применяем сортировку на клиенте
      const sorted = applySorting(filtered, sort);
      
      // Обновляем общее количество
      setTotal(sorted.length);
      
      // Применяем пагинацию на клиенте
      const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
      const safePage = Math.min(page, totalPages);
      if (safePage !== page) setPage(safePage);
      const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
      
      setUsers(paged);
      
    } catch (err) {
      if (err.name !== "AbortError") {
        setError("Не удалось загрузить пользователей. Проверьте соединение и повторите попытку.");
      }
    } finally {
      setLoading(false);
    }
  };

  const normalizeGenderQuery = (value) => {
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return "";
    if (["м", "m", "male"].includes(normalized)) return "male";
    if (["ж", "f", "female"].includes(normalized)) return "female";
    return normalized;
  };

  const applyFilters = (items, activeFilters) => {
    const normalized = Object.fromEntries(
      Object.entries(activeFilters).map(([key, value]) => [key, String(value).trim().toLowerCase()])
    );
    return items.filter((user) => {
      return FILTER_KEYS.every((key) => {
        const query = normalized[key];
        if (!query) return true;
        const value = getFieldValue(user, key);
        if (key === "gender") {
          const normalizedQuery = normalizeGenderQuery(query);
          return String(value).toLowerCase() === normalizedQuery;
        }
        return String(value).toLowerCase().includes(query);
      });
    });
  };

  const applySorting = (items, sortState) => {
    if (!sortState.key || !sortState.order) return items;
    
    const direction = sortState.order === "asc" ? 1 : -1;
    
    return [...items].sort((a, b) => {
      if (sortState.key === "fio") {
        const aName = `${a.lastName} ${a.firstName} ${a.maidenName}`.trim();
        const bName = `${b.lastName} ${b.firstName} ${b.maidenName}`.trim();
        return aName.localeCompare(bName, "ru") * direction;
      }
      
      let aVal = a[sortState.key];
      let bVal = b[sortState.key];
      
      if (sortState.key === "age") {
        return (aVal - bVal) * direction;
      }
      
      if (sortState.key === "gender") {
        const genderOrder = { male: 1, female: 2 };
        return ((genderOrder[aVal] || 0) - (genderOrder[bVal] || 0)) * direction;
      }
      
      return String(aVal).localeCompare(String(bVal)) * direction;
    });
  };

  const getFieldValue = (user, key) => {
    if (key === "country") return user.address?.country || "";
    if (key === "city") return user.address?.city || "";
    return user[key] ?? "";
  };

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

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(
      FILTER_KEYS.reduce((acc, key) => {
        acc[key] = "";
        return acc;
      }, {})
    );
    setPage(1);
  };

  const startResize = (key, event) => {
    event.preventDefault();
    const handleMove = (moveEvent) => {
      const current = resizeRef.current;
      if (!current) return;
      const delta = moveEvent.clientX - current.startX;
      const nextWidth = Math.max(50, current.startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [current.key]: nextWidth }));
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
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return html`
    <div className="page">
      <header className="header">
        <div className="title">Таблица пользователей</div>
        <div className="subtitle">
          Серверная сортировка и постраничная загрузка с дополнительной фильтрацией. Кликните строку, чтобы
          открыть карточку пользователя.
        </div>
      </header>

      <section className="panel">
        <div className="toolbar">
          <div className="status">
            ${loading ? "Загрузка данных..." : `Показано ${displayUsers.length} из ${total} пользователей`}
          </div>
          <div className="actions">
            <button className="button" type="button" onClick=${resetFilters}>
              Сбросить фильтры
            </button>
            <button className="button primary" type="button" onClick=${fetchUsers}>
              Обновить
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style=${{ width: columnWidths.lastName }}>
                  <button className="sort-btn" type="button" onClick=${() => toggleSort("fio")}>
                    Фамилия
                    <span className="sort-icon">${sortLabel("fio")}</span>
                  </button>
                  <span className="resizer" onMouseDown=${(event) => startResize("lastName", event)}></span>
                </th>
                <th style=${{ width: columnWidths.firstName }}>
                  <button className="sort-btn" type="button" onClick=${() => toggleSort("fio")}>
                    Имя
                    <span className="sort-icon">${sortLabel("fio")}</span>
                  </button>
                  <span className="resizer" onMouseDown=${(event) => startResize("firstName", event)}></span>
                </th>
                <th style=${{ width: columnWidths.maidenName }}>
                  <button className="sort-btn" type="button" onClick=${() => toggleSort("fio")}>
                    Отчество
                    <span className="sort-icon">${sortLabel("fio")}</span>
                  </button>
                  <span className="resizer" onMouseDown=${(event) => startResize("maidenName", event)}></span>
                </th>
                <th style=${{ width: columnWidths.age }}>
                  <button className="sort-btn" type="button" onClick=${() => toggleSort("age")}>
                    Возраст
                    <span className="sort-icon">${sortLabel("age")}</span>
                  </button>
                  <span className="resizer" onMouseDown=${(event) => startResize("age", event)}></span>
                </th>
                <th style=${{ width: columnWidths.gender }}>
                  <button className="sort-btn" type="button" onClick=${() => toggleSort("gender")}>
                    Пол
                    <span className="sort-icon">${sortLabel("gender")}</span>
                  </button>
                  <span className="resizer" onMouseDown=${(event) => startResize("gender", event)}></span>
                </th>
                <th style=${{ width: columnWidths.phone }}>
                  <button className="sort-btn" type="button" onClick=${() => toggleSort("phone")}>
                    Телефон
                    <span className="sort-icon">${sortLabel("phone")}</span>
                  </button>
                  <span className="resizer" onMouseDown=${(event) => startResize("phone", event)}></span>
                </th>
                <th style=${{ width: columnWidths.email }}>
                  Email
                  <span className="resizer" onMouseDown=${(event) => startResize("email", event)}></span>
                </th>
                <th style=${{ width: columnWidths.country }}>
                  Страна
                  <span className="resizer" onMouseDown=${(event) => startResize("country", event)}></span>
                </th>
                <th style=${{ width: columnWidths.city }}>
                  Город
                  <span className="resizer" onMouseDown=${(event) => startResize("city", event)}></span>
                </th>
              </tr>
              
              <tr className="filter-row">
                <th>
                  <input
                    type="text"
                    placeholder="Фамилия"
                    value=${filters.lastName}
                    onChange=${(event) => updateFilter("lastName", event.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Имя"
                    value=${filters.firstName}
                    onChange=${(event) => updateFilter("firstName", event.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Отчество"
                    value=${filters.maidenName}
                    onChange=${(event) => updateFilter("maidenName", event.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Возраст"
                    value=${filters.age}
                    onChange=${(event) => updateFilter("age", event.target.value)}
                  />
                </th>
                <th>
                  <select
                    value=${filters.gender}
                    onChange=${(event) => updateFilter("gender", event.target.value)}
                  >
                    <option value="">Все</option>
                    <option value="male">М</option>
                    <option value="female">Ж</option>
                  </select>
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Телефон"
                    value=${filters.phone}
                    onChange=${(event) => updateFilter("phone", event.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Email"
                    value=${filters.email}
                    onChange=${(event) => updateFilter("email", event.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Страна"
                    value=${filters.country}
                    onChange=${(event) => updateFilter("country", event.target.value)}
                  />
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Город"
                    value=${filters.city}
                    onChange=${(event) => updateFilter("city", event.target.value)}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              ${displayUsers.map(
                (user) => html`
                  <tr key=${user.id} onClick=${() => setSelectedUser(user)}>
                    <td style=${{ width: columnWidths.lastName }}>${user.lastName}</td>
                    <td style=${{ width: columnWidths.firstName }}>${user.firstName}</td>
                    <td style=${{ width: columnWidths.maidenName }}>${user.maidenName}</td>
                    <td style=${{ width: columnWidths.age }}>${user.age}</td>
                    <td style=${{ width: columnWidths.gender }}>${user.gender === "male" ? "М" : "Ж"}</td>
                    <td style=${{ width: columnWidths.phone }}>${user.phone}</td>
                    <td style=${{ width: columnWidths.email }}>${user.email}</td>
                    <td style=${{ width: columnWidths.country }}>${user.address?.country}</td>
                    <td style=${{ width: columnWidths.city }}>${user.address?.city}</td>
                  </tr>
                `
              )}
            </tbody>
          </table>
          ${!loading && displayUsers.length === 0
            ? html`<div className="empty">Нет данных по выбранным фильтрам.</div>`
            : null}
        </div>

        <div className="pagination">
          <button type="button" onClick=${() => setPage(1)} disabled=${page === 1}>
            «
          </button>
          <button
            type="button"
            onClick=${() => setPage((prev) => Math.max(1, prev - 1))}
            disabled=${page === 1}
          >
            ‹
          </button>
          <span className="page-info">
            Страница ${page} из ${totalPages}
          </span>
          <button
            type="button"
            onClick=${() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled=${page === totalPages}
          >
            ›
          </button>
          <button type="button" onClick=${() => setPage(totalPages)} disabled=${page === totalPages}>
            »
          </button>
          <label className="page-info">
            Показать по
            <select value=${pageSize} onChange=${(event) => setPageSize(Number(event.target.value))}>
              ${[5, 10, 20, 50].map((size) => html`<option key=${size} value=${size}>${size}</option>`)}
            </select>
          </label>
        </div>

        ${error ? html`<div className="error">${error}</div>` : null}
      </section>

      ${selectedUser
        ? html`
            <div className="modal-backdrop" onClick=${() => setSelectedUser(null)}>
              <div className="modal" onClick=${(event) => event.stopPropagation()}>
                <div className="modal-header">
                  <div>
                    <div className="modal-title">
                      ${selectedUser.lastName} ${selectedUser.firstName} ${selectedUser.maidenName}
                    </div>
                    <span className="badge">
                      ${selectedUser.gender === "male" ? "Мужчина" : "Женщина"}, ${selectedUser.age} лет
                    </span>
                  </div>
                  <button className="button" type="button" onClick=${() => setSelectedUser(null)}>
                    ✕
                  </button>
                </div>
                <div className="modal-grid">
                  <div>
                    <div className="status">Телефон</div>
                    <div>${selectedUser.phone}</div>
                  </div>
                  <div>
                    <div className="status">Email</div>
                    <div>${selectedUser.email}</div>
                  </div>
                  <div>
                    <div className="status">Рост / Вес</div>
                    <div>${selectedUser.height} см · ${selectedUser.weight} кг</div>
                  </div>
                  <div>
                    <div className="status">Адрес</div>
                    <div>${selectedUser.address?.address || '—'}</div>
                    <div>${selectedUser.address?.city || '—'}, ${selectedUser.address?.state || '—'}</div>
                    <div>${selectedUser.address?.country || '—'}, ${selectedUser.address?.postalCode || '—'}</div>
                  </div>
                  <div>
                    <img className="avatar" src=${selectedUser.image} alt="Аватар" />
                  </div>
                </div>
              </div>
            </div>
          `
        : null}
    </div>
  `;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
