// Registro de Service Worker y manejo de estado offline

function updateOnlineStatus() {
    const banner = document.getElementById("offline-banner");
    if (!banner) return;
    if (navigator.onLine) {
        banner.classList.add("hidden");
    } else {
        banner.classList.remove("hidden");
    }
}

window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

document.addEventListener("DOMContentLoaded", () => {
    updateOnlineStatus();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker
                .register("/sw.js")
                .catch((err) => console.error("Error registrando Service Worker:", err));
        });
    }
});

// Utilidad simple para localStorage de búsquedas
const SearchStorage = {
    KEY: "pwa_clientes_busquedas",
    getAll() {
        try {
            const raw = localStorage.getItem(this.KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn("No se pudieron leer las búsquedas desde localStorage", e);
            return [];
        }
    },
    add(term) {
        const t = term.trim();
        if (!t) return;
        const current = this.getAll();
        const filtered = current.filter((v) => v.toLowerCase() !== t.toLowerCase());
        filtered.unshift(t);
        const limited = filtered.slice(0, 5); // mantener solo las 5 últimas
        localStorage.setItem(this.KEY, JSON.stringify(limited));
    },
};


