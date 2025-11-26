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
        alert("No se pudo guardar el cliente (¿sin conexión?). Intenta nuevamente.");
    }
}

async function deleteCliente(id) {
    if (!confirm("¿Seguro que deseas eliminar este cliente?")) return;
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
});


