const API_URL = "/api/clientes";

const tbody = document.getElementById("clientesTableBody");
const emptyState = document.getElementById("clientesEmpty");
const modal = document.getElementById("clienteModal");
const modalTitle = document.getElementById("clienteModalTitle");
const form = document.getElementById("clienteForm");
const inputId = document.getElementById("clienteId");
const inputNombre = document.getElementById("clienteNombre");
const inputSaldo = document.getElementById("clienteSaldo");
const btnNuevo = document.getElementById("btnNuevoCliente");
const btnCancelar = document.getElementById("btnCancelar");
const searchInput = document.getElementById("searchCliente");
const recentSearchesDiv = document.getElementById("recentSearches");

function openModal(edit = false, cliente = null) {
    modal.classList.remove("hidden");
    if (edit && cliente) {
        modalTitle.textContent = "Editar cliente";
        inputId.value = cliente.id;
        inputNombre.value = cliente.nombre;
        inputSaldo.value = cliente.saldo;
    } else {
        modalTitle.textContent = "Nuevo cliente";
        inputId.value = "";
        inputNombre.value = "";
        inputSaldo.value = "";
    }
}

function closeModal() {
    modal.classList.add("hidden");
}

// Almacenamiento local de la lista de clientes para modo offline
const ClientesStorage = {
    KEY: "pwa_clientes_lista",
    save(lista) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(lista || []));
        } catch (e) {
            console.warn("No se pudo guardar la lista de clientes en localStorage", e);
        }
    },
    get() {
        try {
            const raw = localStorage.getItem(this.KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn("No se pudo leer la lista de clientes desde localStorage", e);
            return [];
        }
    },
};

// Cola de cambios pendientes
const SyncQueue = {
    KEY: "pwa_clientes_sync_queue",
    save(queue) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(queue || []));
            renderPendingChanges();
        } catch (e) {
            console.warn("No se pudo guardar la cola de sincronización", e);
        }
    },
    get() {
        try {
            const raw = localStorage.getItem(this.KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },
    add(action, data) {
        const queue = this.get();
        // Generar ID temporal para nuevos items si no tienen
        if (action === "CREATE" && !data.id) {
            data.id = "temp_" + Date.now();
        }
        queue.push({ action, data, timestamp: Date.now() });
        this.save(queue);
    },
    remove(index) {
        const queue = this.get();
        queue.splice(index, 1);
        this.save(queue);
    },
    clear() {
        this.save([]);
    }
};

async function fetchClientes() {
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error("Error al cargar clientes");
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Error al cargar clientes");
        const lista = json.data || [];
        // Guardar última lista correcta en localStorage para modo offline
        ClientesStorage.save(lista);
        renderClientes(lista);
    } catch (e) {
        console.error("Fallo al obtener clientes desde la API, usando datos locales si existen", e);
        // Si falla el fetch (por ejemplo, offline), usar la última lista guardada
        const locales = ClientesStorage.get();
        if (locales && locales.length) {
            renderClientes(locales);
        } else {
            emptyState.classList.remove("hidden");
        }
    }
}

function renderClientes(clientes) {
    tbody.innerHTML = "";
    if (!clientes.length) {
        emptyState.classList.remove("hidden");
        return;
    }
    emptyState.classList.add("hidden");

    const term = (searchInput.value || "").toLowerCase();

    clientes
        .filter((c) => !term || c.nombre.toLowerCase().includes(term))
        .forEach((cliente) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${cliente.id}</td>
                <td>${cliente.nombre}</td>
                <td>${Number(cliente.saldo).toFixed(2)}</td>
                <td>
                    <button class="btn-table btn-edit">Editar</button>
                    <button class="btn-table btn-delete">Eliminar</button>
                </td>
            `;

            tr.querySelector(".btn-edit").addEventListener("click", () => openModal(true, cliente));
            tr.querySelector(".btn-delete").addEventListener("click", () =>
                deleteCliente(cliente.id)
            );

            tbody.appendChild(tr);
        });
}

async function saveCliente(evt) {
    evt.preventDefault();
    const id = inputId.value;
    const payload = {
        nombre: inputNombre.value,
        saldo: inputSaldo.value,
    };

    // Si es edición y tiene ID temporal, es un item creado offline que aún no se sincronizó.
    // Actualizamos la cola en lugar de intentar enviar al servidor.
    if (id && id.toString().startsWith("temp_")) {
        const queue = SyncQueue.get();
        const index = queue.findIndex(item => item.data.id === id && item.action === "CREATE");
        if (index !== -1) {
            queue[index].data = { ...queue[index].data, ...payload };
            SyncQueue.save(queue);
            closeModal();
            // Actualizar UI localmente
            const currentList = ClientesStorage.get();
            const listIndex = currentList.findIndex(c => c.id === id);
            if (listIndex !== -1) {
                currentList[listIndex] = { ...currentList[listIndex], ...payload };
                ClientesStorage.save(currentList);
                renderClientes(currentList);
            }
            return;
        }
    }

    if (!navigator.onLine) {
        // MODO OFFLINE
        const action = id ? "UPDATE" : "CREATE";
        const data = { ...payload, id: id || null };
        
        SyncQueue.add(action, data);
        
        // Optimistic UI update
        const currentList = ClientesStorage.get();
        if (action === "CREATE") {
            // El ID temporal se generó en SyncQueue.add, necesitamos recuperarlo o pre-generarlo.
            // Para simplificar, SyncQueue.add maneja el ID temporal, pero aquí necesitamos saberlo para la UI.
            // Vamos a hacerlo manual aquí para consistencia.
            const tempId = "temp_" + Date.now();
            data.id = tempId;
            // Actualizamos la entrada en la cola con el ID correcto (hacky pero funcional para este scope)
            const queue = SyncQueue.get();
            queue[queue.length - 1].data.id = tempId;
            SyncQueue.save(queue);
            
            currentList.unshift(data);
        } else {
            const index = currentList.findIndex(c => c.id == id);
            if (index !== -1) {
                currentList[index] = { ...currentList[index], ...payload };
            }
        }
        ClientesStorage.save(currentList);
        renderClientes(currentList);
        
        closeModal();
        alert("Estás offline. El cambio se guardó localmente y se sincronizará cuando vuelvas a tener conexión.");
        return;
    }

    const method = id ? "PUT" : "POST";
    const url = id ? `${API_URL}/${id}` : API_URL;

    try {
        const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
            alert(json.error || "Error al guardar el cliente");
            return;
        }
        closeModal();
        fetchClientes();
    } catch (e) {
        console.error(e);
        // Fallback si falla la red inesperadamente
        alert("Error de conexión. Intenta de nuevo o verifica tu internet.");
    }
}

async function deleteCliente(id) {
    if (!confirm("¿Seguro que deseas eliminar este cliente?")) return;

    // Si es un item temporal (creado offline), solo lo borramos de la cola y de la lista local
    if (id.toString().startsWith("temp_")) {
        const queue = SyncQueue.get();
        const index = queue.findIndex(item => item.data.id === id && item.action === "CREATE");
        if (index !== -1) {
            SyncQueue.remove(index);
        }
        const currentList = ClientesStorage.get();
        const listIndex = currentList.findIndex(c => c.id === id);
        if (listIndex !== -1) {
            currentList.splice(listIndex, 1);
            ClientesStorage.save(currentList);
            renderClientes(currentList);
        }
        return;
    }

    if (!navigator.onLine) {
        SyncQueue.add("DELETE", { id });
        
        // Optimistic UI
        const currentList = ClientesStorage.get();
        const listIndex = currentList.findIndex(c => c.id == id);
        if (listIndex !== -1) {
            currentList.splice(listIndex, 1);
            ClientesStorage.save(currentList);
            renderClientes(currentList);
        }
        alert("Estás offline. La eliminación se procesará cuando recuperes la conexión.");
        return;
    }

    try {
        const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok || !json.success) {
            alert(json.error || "Error al eliminar el cliente");
            return;
        }
        fetchClientes();
    } catch (e) {
        console.error(e);
        alert("No se pudo eliminar el cliente (¿sin conexión?).");
    }
}

function renderRecentSearches() {
    if (!window.SearchStorage) return;
    const terms = SearchStorage.getAll();
    recentSearchesDiv.innerHTML = "";
    terms.forEach((t) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = t;
        chip.addEventListener("click", () => {
            searchInput.value = t;
            filterOnSearch();
        });
        recentSearchesDiv.appendChild(chip);
    });
}

function filterOnSearch() {
    if (window.SearchStorage) {
        SearchStorage.add(searchInput.value || "");
        renderRecentSearches();
    }
    // volver a pedir los clientes y filtrar en render
    fetchClientes();
}

document.addEventListener("DOMContentLoaded", () => {
    btnNuevo.addEventListener("click", () => openModal(false));
    btnCancelar.addEventListener("click", () => closeModal());
    form.addEventListener("submit", saveCliente);
    searchInput.addEventListener("change", filterOnSearch);
    searchInput.addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            filterOnSearch();
        }
    });

    renderRecentSearches();
    fetchClientes();
    renderPendingChanges();

    window.addEventListener("online", () => {
        console.log("Conexión restaurada. Procesando cola...");
        processSyncQueue();
    });
    window.addEventListener("offline", () => {
        console.log("Modo offline activado.");
        renderPendingChanges();
    });
});

function renderPendingChanges() {
    const container = document.getElementById("pendingChangesContainer");
    const tbody = document.getElementById("pendingChangesBody");
    const queue = SyncQueue.get();

    if (queue.length === 0) {
        container.classList.add("hidden");
        return;
    }

    container.classList.remove("hidden");
    tbody.innerHTML = "";

    queue.forEach(item => {
        const tr = document.createElement("tr");
        let details = "";
        if (item.action === "DELETE") {
            details = `ID: ${item.data.id}`;
        } else {
            details = `${item.data.nombre} ($${item.data.saldo})`;
        }

        tr.innerHTML = `
            <td><span class="badge ${item.action.toLowerCase()}">${item.action}</span></td>
            <td>${details}</td>
            <td>Pendiente</td>
        `;
        tbody.appendChild(tr);
    });
}

async function processSyncQueue() {
    const queue = SyncQueue.get();
    if (queue.length === 0) return;

    // Mostrar indicador de carga o notificación si se desea
    console.log(`Procesando ${queue.length} cambios pendientes...`);

    // Procesar secuencialmente
    for (const item of queue) {
        try {
            let success = false;
            if (item.action === "CREATE") {
                const res = await fetch(API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nombre: item.data.nombre, saldo: item.data.saldo })
                });
                if (res.ok) success = true;
            } else if (item.action === "UPDATE") {
                const res = await fetch(`${API_URL}/${item.data.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nombre: item.data.nombre, saldo: item.data.saldo })
                });
                if (res.ok) success = true;
            } else if (item.action === "DELETE") {
                const res = await fetch(`${API_URL}/${item.data.id}`, { method: "DELETE" });
                if (res.ok) success = true;
            }

            if (!success) {
                console.error("Fallo al sincronizar item", item);
                // Podríamos decidir parar o continuar. Por ahora continuamos.
            }
        } catch (e) {
            console.error("Error de red al sincronizar", e);
        }
    }

    // Limpiar cola y recargar datos frescos
    SyncQueue.clear();
    renderPendingChanges();
    fetchClientes();
    alert("Sincronización completada.");
}





