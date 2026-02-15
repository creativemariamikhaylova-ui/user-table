const { useEffect, useMemo, useRef, useState, useCallback } = React;
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
  const [columnWidths, setColumnWidths] = useState(() => {
    // Загружаем сохраненные ширины из localStorage
    const saved = localStorage.getItem('columnWidths');
    return saved ? JSON.parse(saved) : { ...DEFAULT_WIDTHS };
  });
  const resizeRef = useRef(null);
  const abortRef = useRef(null);

  // Сохраняем ширины колонок в localStorage
  useEffect(() => {
    localStorage.setItem('columnWidths', JSON.stringify(columnWidths));
  }, [columnWidths]);

  const filtersActive = useMemo(
    () => FILTER_KEYS.some((key) => String(filters[key]).trim() !== ""),
    [filters]
  );

  // Функция для безопасного получения значения поля
  const getFieldValue = useCallback((user, key) => {
    if (!user) return "";
    if (key === "country") return user.address?.country || "";
    if (key === "city") return user.address?.city || "";
    return user[key] ?? "";
  }, []);

  // Функция для безопасного создания объекта пользователя
  const createSafeUser = useCallback((user) => ({
    id: user.id || 0,
    lastName: user.lastName || "",
    firstName: user.firstName || "",
    maidenName: user.maidenName || "",
    age: user.age || 0,
    gender: user.gender || "",
    phone: user.phone || "",
    email: user.email || "",
    height: user.height || 0,
    weight: user.weight || 0,
    image: user.image || "",
    address: {
      address: user.address?.address || "",
      city: user.address?.city || "",
      state: user.address?.state || "",
      country: user.address?.country || "",
      postalCode: user.address?.postalCode || "",
    },
  }), []);

  // Применение фильтров
  const applyFilters = useCallback((items, activeFilters) => {
    const normalized = Object.fromEntries(
      Object.entries(activeFilters).map(([key, value]) => [key, String(value).trim().toLowerCase()])
    );
    
    return items.filter((user) => {
      return FILTER_KEYS.every((key) => {
        const query = normalized[key];
        if (!query) return true;
        const value = getFieldValue(user, key);
        return String(value).toLowerCase().includes(query);
      });
    });
  }, [getFieldValue]);

  // Применение сортировки
  const applySorting = useCallback((items) => {
    if (!sort.key || !sort.order) return items;
    
    if (sort.key === "fio") {
      const direction = sort.order === "asc" ? 1 : -1;
      return [...items].sort((a, b) => {
        const aName = `${a.lastName} ${a.firstName} ${a.maidenName}`.trim();
        const bName = `${b.lastName} ${b.firstName} ${b.maidenName}`.trim();
        return aName.localeCompare(bName, "ru") * direction;
      });
    }
    
    // Для остальных полей используем серверную сортировку
    return items;
  }, [sort]);

  // Загрузка пользователей
  const fetchUsers = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    
    try {
      const params = new URLSearchParams();
      
      // Добавляем параметры сортировки (кроме ФИО)
      if (sort.key && sort.key !== "fio" && sort.order) {
        const sortBy = SORT_FIELDS[sort.key];
        params.set("sortBy", sortBy);
        params.set("order", sort.order);
      }

      // Определяем, нужно ли получать всех пользователей
      const needAllUsers = filtersActive || sort.key === "fio";
      
      if (needAllUsers) {
        params.set("limit", "0"); // Получаем всех
      } else {
        params.set("limit", String(pageSize));
        params.set("skip", String((page - 1) * pageSize));
      }

      const url = `https://dummyjson.com/users?${params.toString()}`;
      const response = await fetch(url, { signal });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      let processedUsers = (Array.isArray(data.users) ? data.users : []).map(createSafeUser);

      if (needAllUsers) {
        // Применяем фильтры на клиенте
        if (filtersActive) {
          processedUsers = applyFilters(processedUsers, filters);
        }
        
        // Применяем сортировку на клиенте
        processedUsers = applySorting(processedUsers);
        
        // Обновляем общее количество
        setTotal(processedUsers.length);
        
        // Корректируем страницу если нужно
        const totalPages = Math.max(1, Math.ceil(processedUsers.length / pageSize));
        const safePage = Math.min(page, totalPages);
        if (safePage !== page) {
          setPage(safePage);
        }
        
        // Применяем пагинацию
        processedUsers = processedUsers.slice(
          (safePage - 1) * pageSize, 
          safePage * pageSize
        );
      } else {
        // Данные уже отсортированы и спагинированы сервером
        processedUsers = processedUsers.map(createSafeUser);
        setTotal(data.total || processedUsers.length);
      }

      setUsers(processedUsers);
      
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Fetch error:", err);
        setError("Не удалось загрузить пользователей. Проверьте соединение и повторите попытку.");
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sort, filters, filtersActive, applyFilters, applySorting, createSafeUser]);

  // Эффект для загрузки данных
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    
    fetchUsers(controller.signal);
    
    return () => {
      controller.abort();
    };
  }, [page, pageSize, sort.key, sort.order, filters, filtersActive, fetchUsers]);

  // Переключение сортировки
  const toggleSort = useCallback((key) => {
    setPage(1);
    setSort((prev) => {
      if (prev.key !== key) return { key, order: "asc" };
      if (prev.order === "asc") return { key, order: "desc" };
      if (prev.order === "desc") return { key: null, order: null };
      return { key, order: "asc" };
    });
  }, []);

  // Получение иконки сортировки
  const sortLabel = useCallback((key) => {
    if (sort.key !== key || !sort.order) return "—";
    return sort.order === "asc" ? "↑" : "↓";
  }, [sort]);

  // Обновление фильтра
  const updateFilter = useCallback((key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Сброс фильтров
  const resetFilters = useCallback(() => {
    setFilters(
      FILTER_KEYS.reduce((acc, key) => {
        acc[key] = "";
        return acc;
      }, {})
    );
    setPage(1);
  }, []);

  // Изменение размера колонки
  const startResize = useCallback((key, event) => {
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
  }, [columnWidths]);

  // Обработчик ошибки загрузки изображения
  const handleImageError = useCallback((e) => {
    e.target.style.display = 'none';
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return html`
    <div className="page">
      <header className="header">
        <div className="kicker">DummyJSON · React 18 · Fetch API</div>
        <div className="title">Таблица пользователей</div>
        <div className="subtitle">
          Серверная сортировка и постраничная загрузка с дополнительной фильтрацией. 
          Кликните строку, чтобы открыть карточку пользователя.
        </div>
      </header>

      <section className="panel">
        <div className="toolbar">
          <div className="status" role="status" aria-live="polite">
            ${loading ? "⏳ Загрузка данных..." : `📊 Показано ${users.length} из ${total} пользователей`}
          </div>
          <div className="actions">
            <button 
              className="button" 
              type="button" 
              onClick=${resetFilters}
              disabled=${!filtersActive}
              aria-label="Сбросить все фильтры"
            >
              🧹 Сбросить фильтры
            </button>
            <button 
              className="button primary" 
              type="button" 
              onClick=${() => fetchUsers(abortRef.current?.signal)}
              disabled=${loading}
              aria-label="Обновить данные"
            >
              🔄 ${loading ? "Загрузка..." : "Обновить"}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th colSpan=${3}>
                  <button 
                    className="sort-btn" 
                    type="button" 
                    onClick=${() => toggleSort("fio")}
                    aria-label="Сортировать по ФИО"
                  >
                    ФИО
                    <span className="sort-icon" aria-hidden="true">${sortLabel("fio")}</span>
                  </button>
                </th>
                <th>
                  <button 
                    className="sort-btn" 
                    type="button" 
                    onClick=${() => toggleSort("age")}
                    aria-label="Сортировать по возрасту"
                  >
                    Возраст
                    <span className="sort-icon" aria-hidden="true">${sortLabel("age")}</span>
                  </button>
                </th>
                <th>
                  <button 
                    className="sort-btn" 
                    type="button" 
                    onClick=${() => toggleSort("gender")}
                    aria-label="Сортировать по полу"
                  >
                    Пол
                    <span className="sort-icon" aria-hidden="true">${sortLabel("gender")}</span>
                  </button>
                </th>
                <th>
                  <button 
                    className="sort-btn" 
                    type="button" 
                    onClick=${() => toggleSort("phone")}
                    aria-label="Сортировать по телефону"
                  >
                    Телефон
                    <span className="sort-icon" aria-hidden="true">${sortLabel("phone")}</span>
                  </button>
                </th>
                <th>Email</th>
                <th>Страна</th>
                <th>Город</th>
              </tr>
              <tr>
                ${COLUMNS.map(
                  (column) => html`
                    <th key=${`label-${column.key}`} style=${{ width: columnWidths[column.key] || "auto" }}>
                      ${column.label}
                      <span 
                        className="resizer" 
                        onMouseDown=${(event) => startResize(column.key, event)}
                        role="slider"
                        aria-label="Изменить ширину колонки ${column.label}"
                        aria-valuemin="50"
                        aria-valuenow=${columnWidths[column.key]}
                      ></span>
                    </th>
                  `
                )}
              </tr>
              <tr className="filter-row">
                ${COLUMNS.map((column) => {
                  if (column.key === "gender") {
                    return html`
                      <th key=${`filter-${column.key}`}>
                        <select
                          value=${filters.gender}
                          onChange=${(event) => updateFilter("gender", event.target.value)}
                          aria-label="Фильтр по полу"
                        >
                          <option value="">Все</option>
                          <option value="male">Мужской</option>
                          <option value="female">Женский</option>
                        </select>
                      </th>
                    `;
                  }

                  return html`
                    <th key=${`filter-${column.key}`}>
                      <input
                        type="text"
                        placeholder="Фильтр"
                        value=${filters[column.key]}
                        onChange=${(event) => updateFilter(column.key, event.target.value)}
                        aria-label="Фильтр по ${column.label}"
                      />
                    </th>
                  `;
                })}
              </tr>
            </thead>
            <tbody>
              ${users.map(
                (user) => html`
                  <tr 
                    key=${user.id} 
                    onClick=${() => setSelectedUser(user)}
                    role="button"
                    tabIndex="0"
                    aria-label="Открыть карточку ${user.lastName} ${user.firstName}"
                    onKeyPress=${(e) => e.key === 'Enter' && setSelectedUser(user)}
                  >
                    <td style=${{ width: columnWidths.lastName }}>${user.lastName || '—'}</td>
                    <td style=${{ width: columnWidths.firstName }}>${user.firstName || '—'}</td>
                    <td style=${{ width: columnWidths.maidenName }}>${user.maidenName || '—'}</td>
                    <td style=${{ width: columnWidths.age }}>${user.age || '—'}</td>
                    <td style=${{ width: columnWidths.gender }}>
                      ${user.gender === 'male' ? 'М' : user.gender === 'female' ? 'Ж' : '—'}
                    </td>
                    <td style=${{ width: columnWidths.phone }}>${user.phone || '—'}</td>
                    <td style=${{ width: columnWidths.email }}>${user.email || '—'}</td>
                    <td style=${{ width: columnWidths.country }}>${user.address?.country || '—'}</td>
                    <td style=${{ width: columnWidths.city }}>${user.address?.city || '—'}</td>
                  </tr>
                `
              )}
            </tbody>
          </table>
          ${!loading && users.length === 0
            ? html`<div className="empty" role="alert">📭 Нет данных по выбранным фильтрам.</div>`
            : null}
        </div>

        <div className="pagination" role="navigation" aria-label="Пагинация">
          <button 
            type="button" 
            onClick=${() => setPage(1)} 
            disabled=${page === 1 || loading}
            aria-label="Первая страница"
          >
            «
          </button>
          <button
            type="button"
            onClick=${() => setPage((prev) => Math.max(1, prev - 1))}
            disabled=${page === 1 || loading}
            aria-label="Предыдущая страница"
          >
            ‹
          </button>
          <span className="page-info" aria-live="polite">
            Страница ${page} из ${totalPages}
          </span>
          <button
            type="button"
            onClick=${() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled=${page === totalPages || loading}
            aria-label="Следующая страница"
          >
            ›
          </button>
          <button 
            type="button" 
            onClick=${() => setPage(totalPages)} 
            disabled=${page === totalPages || loading}
            aria-label="Последняя страница"
          >
            »
          </button>
          <label className="page-info">
            Показать по
            <select 
              value=${pageSize} 
              onChange=${(event) => setPageSize(Number(event.target.value))}
              disabled=${loading}
              aria-label="Количество записей на странице"
            >
              ${[5, 10, 20, 50].map((size) => html`<option key=${size} value=${size}>${size}</option>`)}
            </select>
          </label>
        </div>

        ${error ? html`<div className="error" role="alert">⚠️ ${error}</div>` : null}
      </section>

      ${selectedUser
        ? html`
            <div 
              className="modal-backdrop" 
              onClick=${() => setSelectedUser(null)}
              role="presentation"
            >
              <div 
                className="modal" 
                onClick=${(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Карточка пользователя"
              >
                <div className="modal-header">
                  <div>
                    <div className="modal-title">
                      ${selectedUser.lastName} ${selectedUser.firstName} ${selectedUser.maidenName}
                    </div>
                    <span className="badge">
                      ${selectedUser.gender === "male" ? "Мужчина" : "Женщина"}
                    </span>
                  </div>
                  <button 
                    className="button" 
                    type="button" 
                    onClick=${() => setSelectedUser(null)}
                    aria-label="Закрыть"
                  >
                    ✕
                  </button>
                </div>
                <div className="modal-grid">
                  <div>
                    <div className="status">Возраст</div>
                    <div>${selectedUser.age} лет</div>
                  </div>
                  <div>
                    <div className="status">Телефон</div>
                    <div>${selectedUser.phone || '—'}</div>
                  </div>
                  <div>
                    <div className="status">Email</div>
                    <div>${selectedUser.email || '—'}</div>
                  </div>
                  <div>
                    <div className="status">Рост / Вес</div>
                    <div>${selectedUser.height} см · ${selectedUser.weight} кг</div>
                  </div>
                  <div>
                    <div className="status">Адрес</div>
                    <div>${selectedUser.address?.address || '—'}</div>
                    <div>${selectedUser.address?.city || '—'}</div>
                    <div>${selectedUser.address?.country || '—'}</div>
                  </div>
                  <div>
                    ${selectedUser.image ? html`
                      <img 
                        className="avatar" 
                        src=${selectedUser.image} 
                        alt="Аватар ${selectedUser.firstName}"
                        onError=${handleImageError}
                        loading="lazy"
                      />
                    ` : html`<div className="avatar-placeholder">📷</div>`}
                  </div>
                </div>
              </div>
            </div>
          `
        : null}
    </div>
  `;
}

// Монтируем приложение
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(html`<${App} />`);