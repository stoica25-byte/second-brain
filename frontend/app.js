// --- STATE VARIABLES ---
let notes = {};
let graphData = { nodes: [], links: [] };
let activeNote = null;
let graphInstance = null;
let selectedGraphNode = null;
let activeCategoryFilters = ["ideas", "skills", "errors", "journal", "sources"];
let currentSearchQuery = "";

// Offline Telemetry Queue
let isOffline = false;
let offlineQueue = []; // Array of task objects

// Timeline Pagination
let timelinePage = 1;
const timelineLimit = 15;
let timelineTotalPages = 1;

// Curation Undo Handlers
let pendingTriageActions = {}; // Maps safeId -> { timerId, action, category, filename, payload, cardElement }

// Category Accent Colors (Sync with CSS variables)
const CATEGORY_COLORS = {
    ideas: "#bb9af7",      // Lavender
    skills: "#73daca",     // Neon Teal
    errors: "#f7768e",     // Coral Red
    journal: "#7aa2f7",    // Ice Blue
    sources: "#e0af68"     // Amber Gold
};

// Utilidad para mapear rutas de archivo a selectores DOM seguros (reemplaza Base64)
function getSafeId(path) {
    if (!path) return "safe_id_null";
    return path.replace(/[^a-zA-Z0-9]/g, '_');
}

// --- DOM ELEMENTS ---
const searchInput = document.getElementById("global-search");
const syncBtn = document.getElementById("sync-btn");
const syncText = document.getElementById("sync-text");
const themeToggleBtn = document.getElementById("theme-toggle-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const settingsClose = document.getElementById("settings-close");
const copyTokenBtn = document.getElementById("copy-token-btn");
const settingTokenInput = document.getElementById("setting-ingest-token");
const gitStatusCard = document.getElementById("git-settings-status");
const reindexBtn = document.getElementById("settings-btn-reindex");

const statTotalNotes = document.getElementById("stat-total-notes");
const statTotalLinks = document.getElementById("stat-total-links");
const statDensity = document.getElementById("stat-density");
const statDraftNotes = document.getElementById("stat-draft-notes");

const inboxCount = document.getElementById("inbox-count");
const inboxFeed = document.getElementById("inbox-feed");
const inboxEmpty = document.getElementById("inbox-empty");

// Note view DOM elements
const noteViewer = document.getElementById("note-viewer");
const viewNoteBadge = document.getElementById("view-note-badge");
const viewNoteTitle = document.getElementById("view-note-title");
const viewNoteDates = document.getElementById("view-note-dates");
const viewNoteBody = document.getElementById("view-note-body");
const viewNoteTags = document.getElementById("view-note-tags");
const viewNoteBacklinks = document.getElementById("view-note-backlinks");
const btnDeleteNote = document.getElementById("btn-delete-note");
const btnOpenObsidianNote = document.getElementById("btn-open-obsidian-note");
const btnOpenObsidianActive = document.getElementById("btn-open-obsidian-active");

// Left panel git controls
const leftPanelGitStatus = document.getElementById("left-panel-git-status");
const leftPanelSyncBtn = document.getElementById("left-panel-sync-btn");

// Timeline elements
const timelineStream = document.getElementById("timeline-stream");

// SCoA Debate DOM elements
const scoaTriggerBtn = document.getElementById("scoa-trigger-btn");
const scoaModal = document.getElementById("scoa-modal");
const scoaClose = document.getElementById("scoa-close");
const scoaProposal = document.getElementById("scoa-proposal");
const scoaCategory = document.getElementById("scoa-category");
const scoaStartBtn = document.getElementById("scoa-start-btn");
const scoaProgressContainer = document.getElementById("scoa-progress-container");
const scoaInputGroup = document.getElementById("scoa-input-group");
const scoaLiveStageTitle = document.getElementById("scoa-live-stage-title");
const scoaDebateRecord = document.getElementById("scoa-debate-record");
const judgeSecurity = document.getElementById("judge-security");
const judgePerformance = document.getElementById("judge-performance");
const judgeUiux = document.getElementById("judge-uiux");
const judgeModerator = document.getElementById("judge-moderator");
const statusSecurity = document.getElementById("status-security");
const statusPerformance = document.getElementById("status-performance");
const statusUiux = document.getElementById("status-uiux");
const statusModerator = document.getElementById("status-moderator");
const scoaStageSecurity = document.getElementById("scoa-stage-security");
const scoaStagePerformance = document.getElementById("scoa-stage-performance");
const scoaStageUiux = document.getElementById("scoa-stage-uiux");
const scoaStageModerator = document.getElementById("scoa-stage-moderator");
const scoaOutputSecurity = document.getElementById("scoa-output-security");
const scoaOutputPerformance = document.getElementById("scoa-output-performance");
const scoaOutputUiux = document.getElementById("scoa-output-uiux");
const scoaOutputModerator = document.getElementById("scoa-output-moderator");

// Conflict resolution DOM elements
const conflictModal = document.getElementById("conflict-modal");
const conflictFilename = document.getElementById("conflict-filename");
const localDiffContent = document.getElementById("local-diff-content");
const remoteDiffContent = document.getElementById("remote-diff-content");
const manualMergeTextarea = document.getElementById("manual-merge-textarea");
const conflictBtnLocal = document.getElementById("conflict-btn-local");
const conflictBtnRemote = document.getElementById("conflict-btn-remote");
const conflictBtnManual = document.getElementById("conflict-btn-manual");

let currentConflictFilepath = "";

// Global graph state
let globalGraphInstance = null;
let globalGraphInitialized = false;

// --- INITIALIZATION ---
window.addEventListener("DOMContentLoaded", async () => {
    marked.setOptions({
        gfm: true,
        breaks: true
    });
    
    // Load local theme and settings
    initTheme();
    setupEventListeners();
    
    // Load local cache queue
    if (localStorage.getItem("offline-queue")) {
        try {
            offlineQueue = JSON.parse(localStorage.getItem("offline-queue"));
        } catch (e) {
            offlineQueue = [];
        }
    }
    
    // Load workspace data
    await loadData();
    checkGitStatus();
    
    // Start server heartbeat loop
    setInterval(heartbeat, 5000);
});

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Search
    searchInput.addEventListener("input", (e) => {
        currentSearchQuery = e.target.value.toLowerCase().trim();
        // Show/hide clear button
        const clearBtn = document.getElementById("clear-search-btn");
        if (clearBtn) clearBtn.style.display = currentSearchQuery ? "inline" : "none";
        filterTimeline();
    });
    
    const clearSearchBtn = document.getElementById("clear-search-btn");
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener("click", () => {
            searchInput.value = "";
            currentSearchQuery = "";
            clearSearchBtn.style.display = "none";
            const countEl = document.getElementById("search-result-count");
            if (countEl) countEl.style.display = "none";
            filterTimeline();
            searchInput.focus();
        });
    }
    
    // Sync triggers
    syncBtn.addEventListener("click", handleSync);
    leftPanelSyncBtn.addEventListener("click", handleSync);
    
    // Settings Modal
    settingsBtn.addEventListener("click", openSettings);
    settingsClose.addEventListener("click", () => settingsModal.classList.remove("active"));
    window.addEventListener("click", (e) => {
        if (e.target === settingsModal) settingsModal.classList.remove("active");
    });
    
    copyTokenBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(settingTokenInput.value);
        copyTokenBtn.innerText = "Copiado!";
        setTimeout(() => copyTokenBtn.innerText = "Copiar", 2000);
    });
    
    reindexBtn.addEventListener("click", async () => {
        reindexBtn.innerText = "Indexando...";
        await fetch("/api/index/rebuild", { method: "POST" });
        await loadData();
        reindexBtn.innerText = "Forzar Re-indexar Cerebro";
    });
    
    // Obsidian deep link triggers
    btnOpenObsidianActive.addEventListener("click", () => {
        if (activeNote) {
            openNoteInObsidian(activeNote);
        } else {
            openVaultInObsidian();
        }
    });
    btnOpenObsidianNote.addEventListener("click", () => {
        if (activeNote) openNoteInObsidian(activeNote);
    });
    
    // Delete note trigger
    btnDeleteNote.addEventListener("click", handleDeleteNote);
    
    // Theme toggle
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", toggleTheme);
    }
    
    // SCoA modal
    if (scoaTriggerBtn) {
        scoaTriggerBtn.addEventListener("click", () => {
            scoaModal.classList.add("active");
            scoaInputGroup.classList.remove("hidden");
            scoaProgressContainer.classList.add("hidden");
            scoaProposal.value = "";
        });
    }
    if (scoaClose) {
        scoaClose.addEventListener("click", () => scoaModal.classList.remove("active"));
    }
    if (scoaStartBtn) {
        scoaStartBtn.addEventListener("click", startScoaDebate);
    }
    
    // SCoA tabs
    if (judgeSecurity) judgeSecurity.addEventListener("click", () => selectScoaTab("security"));
    if (judgePerformance) judgePerformance.addEventListener("click", () => selectScoaTab("performance"));
    if (judgeUiux) judgeUiux.addEventListener("click", () => selectScoaTab("uiux"));
    if (judgeModerator) judgeModerator.addEventListener("click", () => selectScoaTab("moderator"));
    
    window.addEventListener("click", (e) => {
        if (e.target === scoaModal) scoaModal.classList.remove("active");
        if (e.target === conflictModal) conflictModal.classList.remove("active");
    });
    
    // Conflict modal resolutions
    conflictBtnLocal.addEventListener("click", () => resolveConflict("local"));
    conflictBtnRemote.addEventListener("click", () => resolveConflict("remote"));
    conflictBtnManual.addEventListener("click", () => resolveConflict("manual"));
    
    // --- CENTER PANEL TAB SWITCHING ---
    const tabTimeline = document.getElementById("tab-timeline");
    const tabGraph = document.getElementById("tab-graph");
    const viewTimeline = document.getElementById("view-timeline-container");
    const viewGraph = document.getElementById("view-graph-container");
    
    if (tabTimeline && tabGraph && viewTimeline && viewGraph) {
        tabTimeline.addEventListener("click", () => {
            tabTimeline.classList.add("active");
            tabTimeline.style.background = "rgba(187, 154, 247, 0.15)";
            tabTimeline.style.borderColor = "rgba(187, 154, 247, 0.4)";
            tabTimeline.style.color = "var(--color-ideas)";
            tabGraph.classList.remove("active");
            tabGraph.style.background = "transparent";
            tabGraph.style.borderColor = "rgba(255, 255, 255, 0.1)";
            tabGraph.style.color = "var(--text-muted)";
            viewTimeline.style.display = "flex";
            viewGraph.classList.add("hidden");
        });
        
        tabGraph.addEventListener("click", () => {
            tabGraph.classList.add("active");
            tabGraph.style.background = "rgba(115, 218, 202, 0.15)";
            tabGraph.style.borderColor = "rgba(115, 218, 202, 0.4)";
            tabGraph.style.color = "var(--color-skills)";
            tabTimeline.classList.remove("active");
            tabTimeline.style.background = "transparent";
            tabTimeline.style.borderColor = "rgba(255, 255, 255, 0.1)";
            tabTimeline.style.color = "var(--text-muted)";
            viewTimeline.style.display = "none";
            viewGraph.classList.remove("hidden");
            
            // Lazy-initialize global graph on first open
            if (!globalGraphInitialized) {
                initGlobalGraph();
                globalGraphInitialized = true;
            } else {
                // If data has updated, re-render
                updateGlobalGraph();
            }
        });
    }
    
    // GitHub remote setup button
    const setRemoteBtn = document.getElementById("set-remote-btn");
    if (setRemoteBtn) {
        setRemoteBtn.addEventListener("click", handleSetRemote);
    }
}

// --- DATA LOADERS ---
async function loadData() {
    try {
        const response = await fetch("/api/index");
        const data = await response.json();
        
        notes = data.notes;
        graphData = data.graph;
        
        updateStats();
        await loadInbox();
        await loadTimeline(1, false);
        
        // Restore active note if applicable
        if (activeNote) {
            const rel_path = activeNote.path;
            const updated = notes[rel_path];
            if (updated) {
                openNote(updated);
            } else {
                closeNoteView();
            }
        }
    } catch (e) {
        console.error("Error loading index data:", e);
    }
}

async function updateStats() {
    try {
        const res = await fetch("/api/stats");
        const stats = await res.json();
        
        statTotalNotes.innerText = stats.total_notes;
        statTotalLinks.innerText = stats.total_connections;
        statDensity.innerText = stats.graph_density.toFixed(4);
        statDraftNotes.innerText = stats.draft_notes;
    } catch (e) {
        console.error("Stats load failed:", e);
    }
}

// --- INBOX CURATION (INLINE TRIAGE PANEL) ---
async function loadInbox() {
    try {
        const res = await fetch("/api/drafts");
        const drafts = await res.json();
        
        inboxFeed.innerHTML = "";
        
        if (drafts.length > 0) {
            inboxCount.innerText = drafts.length;
            inboxEmpty.classList.add("hidden");
            
            drafts.forEach(draft => {
                // Construct a safe DOM element selector ID
                const safeId = getSafeId(draft.path);
                
                const card = document.createElement("div");
                card.className = "triage-card";
                card.id = `triage-card-${safeId}`;
                
                // Formatter for tag outputs
                const tagsList = draft.tags.map(t => `#${t}`).join(", ");
                
                card.innerHTML = `
                    <div class="triage-header">
                        <span class="source-tag">${draft.source_type || 'Draft'}</span>
                        <span class="timestamp">${draft.created}</span>
                    </div>
                    <div class="triage-title" id="triage-title-display-${safeId}">${draft.title}</div>
                    <div class="triage-quick-actions">
                        <button class="btn-triage btn-triage-approve" onclick="triageApprove('${draft.category}', '${draft.filename}', '${safeId}')">Aprobar</button>
                        <button class="btn-triage btn-triage-edit" onclick="triageToggleEdit('${safeId}')">Editar</button>
                        <button class="btn-triage btn-triage-discard" onclick="triageDiscard('${draft.category}', '${draft.filename}', '${safeId}')">Descartar</button>
                    </div>
                    <div class="metadata-edit-drawer" id="triage-drawer-${safeId}">
                        <div class="metadata-edit-wrapper">
                            <div class="triage-input-group">
                                <label>Título</label>
                                <input type="text" id="triage-input-title-${safeId}" value="${draft.title}">
                            </div>
                            <div class="triage-input-row">
                                <div class="triage-input-group">
                                    <label>Categoría</label>
                                    <select id="triage-input-category-${safeId}">
                                        <option value="ideas" ${draft.category === 'ideas' ? 'selected' : ''}>Ideas</option>
                                        <option value="skills" ${draft.category === 'skills' ? 'selected' : ''}>Skills</option>
                                        <option value="errors" ${draft.category === 'errors' ? 'selected' : ''}>Errors</option>
                                        <option value="journal" ${draft.category === 'journal' ? 'selected' : ''}>Journal</option>
                                        <option value="sources" ${draft.category === 'sources' ? 'selected' : ''}>Sources</option>
                                    </select>
                                </div>
                                <div class="triage-input-group">
                                    <label>Tags (comas)</label>
                                    <input type="text" id="triage-input-tags-${safeId}" value="${draft.tags.join(', ')}">
                                </div>
                            </div>
                            <div class="triage-drawer-actions">
                                <button class="btn-drawer-cancel" onclick="triageToggleEdit('${safeId}')">Cancelar</button>
                                <button class="btn-drawer-confirm" onclick="triageSaveMetadata('${draft.category}', '${draft.filename}', '${safeId}')">Guardar</button>
                            </div>
                        </div>
                    </div>
                `;
                inboxFeed.appendChild(card);
            });
        } else {
            inboxCount.innerText = "0";
            inboxEmpty.classList.remove("hidden");
        }
    } catch (e) {
        console.error("Inbox load failed:", e);
    }
}

function triageToggleEdit(safeId) {
    const card = document.getElementById(`triage-card-${safeId}`);
    const drawer = document.getElementById(`triage-drawer-${safeId}`);
    if (card && drawer) {
        card.classList.toggle("editing");
    }
}

async function triageSaveMetadata(category, filename, safeId) {
    const titleVal = document.getElementById(`triage-input-title-${safeId}`).value.trim();
    const catVal = document.getElementById(`triage-input-category-${safeId}`).value;
    const tagsVal = document.getElementById(`triage-input-tags-${safeId}`).value;
    
    if (!titleVal) {
        alert("El título de la nota no puede estar vacío.");
        return;
    }
    
    const tagsArr = tagsVal.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
    const payload = {
        title: titleVal,
        category: catVal,
        tags: tagsArr
    };
    
    if (isOffline) {
        offlineQueue.push({
            type: 'metadata',
            category: category,
            filepath: filename,
            payload: payload
        });
        localStorage.setItem("offline-queue", JSON.stringify(offlineQueue));
        showToast("warning", "Metadatos actualizados localmente en la cola offline.");
        triageToggleEdit(safeId);
        return;
    }
    
    try {
        const url = `/api/notes/metadata/${category}/${encodeURIComponent(filename)}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        if (res.status === 423) {
            alert("Acción bloqueada: El archivo está abierto en Obsidian o bloqueado por Windows. Cierra el archivo y vuelve a intentarlo.");
            return;
        }
        
        const data = await res.json();
        if (data.status === "success") {
            showToast("success", "Nota curada con éxito.");
            await loadData();
        }
    } catch (e) {
        console.error("Metadata save failed:", e);
        showToast("error", "Fallo al guardar metadatos de borrador.");
    }
}

// Optimistic Curations with 8s Undo Toast
function triageApprove(category, filename, safeId) {
    const cardEl = document.getElementById(`triage-card-${safeId}`);
    if (!cardEl) return;
    
    // Check if there is a raw source note content
    const sourcePath = `${category}/${filename}`;
    const rawNote = notes[sourcePath];
    const content = rawNote ? rawNote.summary : "Borrador de captura curado en la consola.";
    
    const titleInput = document.getElementById(`triage-input-title-${safeId}`);
    const catInput = document.getElementById(`triage-input-category-${safeId}`);
    const tagsInput = document.getElementById(`triage-input-tags-${safeId}`);
    
    const finalTitle = titleInput ? titleInput.value.trim() : (rawNote ? rawNote.title : filename.replace(".md", ""));
    const finalCat = catInput ? catInput.value : category;
    const finalTags = tagsInput ? tagsInput.value.split(",").map(t => t.trim()).filter(t => t) : (rawNote ? rawNote.tags : []);
    
    const payload = {
        category: finalCat,
        title: finalTitle,
        content: content,
        tags: finalTags
    };
    
    // Apply slide-out approved animation
    cardEl.classList.add("approved");
    
    // Wait for animation transition, then collapse layout heights
    setTimeout(() => {
        cardEl.classList.add("collapsing-height");
    }, 400);
    
    // Start timer for 8 seconds
    const timerId = setTimeout(() => {
        executeTriageAction(safeId);
    }, 8000);
    
    pendingTriageActions[safeId] = {
        timerId: timerId,
        action: "approve",
        category: category,
        filename: filename,
        payload: payload,
        cardElement: cardEl
    };
    
    showUndoToast(safeId, `Aprobando nota "${finalTitle}"...`);
}

function triageDiscard(category, filename, safeId) {
    const cardEl = document.getElementById(`triage-card-${safeId}`);
    if (!cardEl) return;
    
    const titleDisplay = document.getElementById(`triage-title-display-${safeId}`);
    const finalTitle = titleDisplay ? titleDisplay.innerText : filename;
    
    // Apply slide-out discarded animation
    cardEl.classList.add("discarded");
    
    setTimeout(() => {
        cardEl.classList.add("collapsing-height");
    }, 400);
    
    // Start timer for 8 seconds
    const timerId = setTimeout(() => {
        executeTriageAction(safeId);
    }, 8000);
    
    pendingTriageActions[safeId] = {
        timerId: timerId,
        action: "discard",
        category: category,
        filename: filename,
        payload: null,
        cardElement: cardEl
    };
    
    showUndoToast(safeId, `Eliminando borrador "${finalTitle}"...`);
}

function showUndoToast(safeId, text) {
    // Check if toast already exists
    let toast = document.getElementById(`undo-toast-${safeId}`);
    if (toast) toast.remove();
    
    toast = document.createElement("div");
    toast.className = "toast-notification undo-toast";
    toast.id = `undo-toast-${safeId}`;
    
    toast.innerHTML = `
        <div style="flex: 1; margin-right: 12px;">
            <p style="margin: 0; font-size: 12px; font-weight: 500;">${text}</p>
        </div>
        <button class="btn-undo-action" onclick="triageUndo('${safeId}')">Deshacer</button>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove toast after 8 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.transform = "translateY(20px)";
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 350);
        }
    }, 8000);
}

function triageUndo(safeId) {
    const actionObj = pendingTriageActions[safeId];
    if (!actionObj) return;
    
    // Cancel the promotion/deletion timer
    clearTimeout(actionObj.timerId);
    
    // Restore the card UI state
    const cardEl = actionObj.cardElement;
    if (cardEl) {
        cardEl.classList.remove("collapsing-height");
        setTimeout(() => {
            cardEl.classList.remove("approved", "discarded");
        }, 100);
    }
    
    // Clear toast notification
    const toast = document.getElementById(`undo-toast-${safeId}`);
    if (toast) {
        toast.remove();
    }
    
    delete pendingTriageActions[safeId];
    showToast("success", "Acción cancelada con éxito.");
}

async function executeTriageAction(safeId) {
    const actionObj = pendingTriageActions[safeId];
    if (!actionObj) return;
    
    const { action, category, filename, payload } = actionObj;
    delete pendingTriageActions[safeId];
    
    const toast = document.getElementById(`undo-toast-${safeId}`);
    if (toast) toast.remove();
    
    if (isOffline) {
        offlineQueue.push({
            type: action === 'approve' ? 'promote' : 'delete',
            category: category,
            filepath: filename,
            payload: payload
        });
        localStorage.setItem("offline-queue", JSON.stringify(offlineQueue));
        showToast("warning", "Acción en cola local (Offline).");
        await loadData();
        return;
    }
    
    try {
        if (action === "approve") {
            const url = `/api/notes/promote/${category}/${encodeURIComponent(filename)}`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.status === 423) {
                triageRollbackUI(actionObj);
                alert("Promoción bloqueada: El archivo está abierto en Obsidian o bloqueado por Windows.");
                return;
            }
        } else if (action === "discard") {
            const url = `/api/notes/${category}/${encodeURIComponent(filename)}`;
            const res = await fetch(url, { method: "DELETE" });
            if (res.status === 423) {
                triageRollbackUI(actionObj);
                alert("Eliminación bloqueada: El archivo está abierto en Obsidian o bloqueado por Windows.");
                return;
            }
        }
        await loadData();
    } catch (e) {
        console.error("Triage action failed to dispatch:", e);
        triageRollbackUI(actionObj);
    }
}

function triageRollbackUI(actionObj) {
    const cardEl = actionObj.cardElement;
    if (cardEl) {
        cardEl.classList.remove("collapsing-height");
        setTimeout(() => {
            cardEl.classList.remove("approved", "discarded");
        }, 100);
    }
    showToast("error", "Error del servidor. Restaurando borrador.");
}

// --- TIMELINE DE APRENDIZAJE ---
async function loadTimeline(page = 1, append = false) {
    try {
        const query = currentSearchQuery ? `&query=${encodeURIComponent(currentSearchQuery)}` : "";
        // Send active category filters to backend
        const catParam = activeCategoryFilters.length > 0 && activeCategoryFilters.length < 5
            ? `&categories=${encodeURIComponent(activeCategoryFilters.join(","))}`
            : "";
        const res = await fetch(`/api/timeline?page=${page}&limit=${timelineLimit}${query}${catParam}`);
        const data = await res.json();
        
        timelinePage = data.current_page;
        timelineTotalPages = data.total_pages;
        
        // Show result count if searching
        const searchCountEl = document.getElementById("search-result-count");
        if (searchCountEl) {
            if (currentSearchQuery) {
                searchCountEl.textContent = `${data.total_count} resultado${data.total_count !== 1 ? 's' : ''}`;
                searchCountEl.style.display = "inline";
            } else {
                searchCountEl.style.display = "none";
            }
        }
        
        if (!append) {
            timelineStream.innerHTML = "";
        } else {
            // Remove previous Ver Más button
            const oldMoreBtn = document.getElementById("timeline-more-btn");
            if (oldMoreBtn) oldMoreBtn.remove();
        }
        
        const events = data.events;
        if (events.length > 0) {
            events.forEach(event => {
                const safePath = getSafeId(event.path);
                
                const card = document.createElement("div");
                card.className = `timeline-card ${event.category}`;
                card.id = `timeline-card-${safePath}`;
                
                // Highlight search terms in title and summary
                const highlightText = (text) => {
                    if (!currentSearchQuery || !text) return text;
                    const terms = currentSearchQuery.trim().split(/\s+/);
                    let result = text;
                    terms.forEach(term => {
                        if (!term) return;
                        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        result = result.replace(new RegExp(`(${escaped})`, 'gi'),
                            '<mark style="background:rgba(187,154,247,0.3);color:inherit;border-radius:2px;padding:0 2px;">$1</mark>');
                    });
                    return result;
                };
                
                card.innerHTML = `
                    <div class="timeline-card-marker"></div>
                    <div class="timeline-card-header">
                        <div class="card-meta">
                            <span class="category-pill color-${event.category}-text">${event.category}</span>
                            <span class="card-time">${event.date || 'Sin Fecha'}</span>
                        </div>
                        <h3 class="card-title">${highlightText(event.title)}</h3>
                    </div>
                    <div class="timeline-card-summary" id="timeline-summary-${safePath}">${highlightText(event.summary)}</div>
                    
                    <div class="timeline-card-collapsible">
                        <div class="timeline-card-body-inner markdown-body" id="timeline-body-${safePath}">
                            <!-- Markdown parsed HTML populated on click expansion -->
                        </div>
                    </div>
                `;
                
                // Add expansion trigger on click
                card.addEventListener("click", (e) => {
                    // Prevent expansion when clicking nested link nodes
                    if (e.target.tagName === 'A' || e.target.closest('a')) return;
                    toggleTimelineCard(event, safePath);
                });
                
                timelineStream.appendChild(card);
            });
            
            // Add Pagination Load More button
            if (timelinePage < timelineTotalPages) {
                const moreBtn = document.createElement("button");
                moreBtn.id = "timeline-more-btn";
                moreBtn.className = "btn-secondary";
                moreBtn.style.width = "calc(100% - 48px)";
                moreBtn.style.marginLeft = "48px";
                moreBtn.style.marginTop = "10px";
                moreBtn.innerText = "Ver Más Cronologías";
                moreBtn.addEventListener("click", () => {
                    loadTimeline(timelinePage + 1, true);
                });
                timelineStream.appendChild(moreBtn);
            }
        } else {
            if (!append) {
                if (currentSearchQuery) {
                    timelineStream.innerHTML = `
                        <div class="inbox-empty-placeholder" style="padding:32px 16px; text-align:center;">
                            <div style="font-size:28px; margin-bottom:12px;">🔍</div>
                            <div style="font-size:13px; color:var(--text-muted);">Sin resultados para <strong style="color:var(--text-primary);">&quot;${currentSearchQuery}&quot;</strong></div>
                            <div style="font-size:11px; color:var(--text-placeholder); margin-top:6px;">Prueba con otra búsqueda o amplía los filtros de categoría</div>
                        </div>`;
                } else {
                    timelineStream.innerHTML = `<div class="inbox-empty-placeholder">No se encontraron eventos activos en la cronología.</div>`;
                }
            }
        }
    } catch (e) {
        console.error("Timeline loading failed:", e);
    }
}

async function toggleTimelineCard(event, safePath) {
    const card = document.getElementById(`timeline-card-${safePath}`);
    const summary = document.getElementById(`timeline-summary-${safePath}`);
    const bodyInner = document.getElementById(`timeline-body-${safePath}`);
    
    if (!card) return;
    
    const isExpanded = card.classList.contains("expanded");
    
    // Close other expanded cards
    document.querySelectorAll(".timeline-card.expanded").forEach(el => {
        if (el !== card) {
            el.classList.remove("expanded");
            const otherPath = el.id.replace("timeline-card-", "");
            const otherSum = document.getElementById(`timeline-summary-${otherPath}`);
            if (otherSum) otherSum.style.display = "block";
        }
    });
    
    if (isExpanded) {
        card.classList.remove("expanded");
        if (summary) summary.style.display = "block";
    } else {
        card.classList.add("expanded");
        if (summary) summary.style.display = "none";
        
        // Parse and render note content
        bodyInner.innerHTML = renderMarkdown(event.content);
        bindWikiLinkPreviews(bodyInner);
        
        // Match Sidebar and Note Viewer details
        const fullNote = notes[event.path];
        if (fullNote) {
            openNote(fullNote);
        }
    }
}

function filterTimeline() {
    timelinePage = 1;
    loadTimeline(1, false);
}

// --- NOTE VIEWER & INSPECTOR ---
async function openNote(note) {
    activeNote = note;
    
    try {
        const res = await fetch(`/api/notes/${note.category}/${encodeURIComponent(note.filename)}`);
        if (res.status === 404) {
            showToast("error", "El archivo de la nota no se encuentra en el disco.");
            return;
        }
        const fullNote = await res.json();
        
        // Fill Viewer Header
        viewNoteBadge.innerText = note.category;
        viewNoteBadge.className = `note-category-badge ${note.category}`;
        viewNoteTitle.innerText = fullNote.title;
        viewNoteDates.innerText = `Creada: ${fullNote.created || "n/a"} • Actualizada: ${fullNote.updated || "n/a"}`;
        
        // Render Markdown body safely
        viewNoteBody.innerHTML = renderMarkdown(fullNote.content);
        bindWikiLinkPreviews(viewNoteBody);
        
        // Render tags
        viewNoteTags.innerHTML = "";
        if (fullNote.tags.length > 0) {
            fullNote.tags.forEach(tag => {
                const span = document.createElement("span");
                span.className = "tag-pill";
                span.innerText = `#${tag}`;
                viewNoteTags.appendChild(span);
            });
        }
        
        // Render Backlinks
        viewNoteBacklinks.innerHTML = "";
        const backlinks = note.backlinks || [];
        if (backlinks.length > 0) {
            backlinks.forEach(pathKey => {
                const backNote = notes[pathKey];
                if (backNote) {
                    const li = document.createElement("li");
                    li.innerText = backNote.title;
                    li.addEventListener("click", () => openNote(backNote));
                    viewNoteBacklinks.appendChild(li);
                }
            });
        } else {
            const li = document.createElement("li");
            li.className = "empty-backlinks";
            li.innerText = "Ninguna nota enlaza aquí todavía.";
            viewNoteBacklinks.appendChild(li);
        }
        
        // Enabled actions
        btnDeleteNote.disabled = false;
        btnOpenObsidianNote.disabled = false;
        
        // Render local Connection Radar Ego-Graph
        drawConnectionRadar(note.path);
        
    } catch (e) {
        console.error("Inspector open note failed:", e);
    }
}

function renderMarkdown(mdText) {
    if (!mdText) return "<p><i>Contenido vacío</i></p>";
    
    // Parse WikiLinks: [[Target Note]] or [[Target Note|Alias]]
    let processed = mdText.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, alias) => {
        const noteName = target.trim();
        const display = alias ? alias.trim() : noteName;
        
        // Check target exists by matching note titles in database
        const exists = Object.values(notes).some(n => n.title.toLowerCase() === noteName.toLowerCase());
        const className = exists ? "wikilink" : "wikilink broken";
        
        return `<a class="${className}" href="#" data-note="${noteName}">${display}</a>`;
    });
    
    const rawHtml = marked.parse(processed);
    return DOMPurify.sanitize(rawHtml);
}

function bindWikiLinkPreviews(container = document) {
    const anchors = container.querySelectorAll(".wikilink");
    anchors.forEach(a => {
        const name = a.getAttribute("data-note");
        
        // Click action
        a.addEventListener("click", (e) => {
            e.preventDefault();
            const targetNote = Object.values(notes).find(n => n.title.toLowerCase() === name.toLowerCase());
            if (targetNote) {
                openNote(targetNote);
                
                // Highlight expanded timeline card if it exists
                const safePath = getSafeId(targetNote.path);
                const tCard = document.getElementById(`timeline-card-${safePath}`);
                if (tCard) {
                    tCard.scrollIntoView({ behavior: "smooth", block: "center" });
                    if (!tCard.classList.contains("expanded")) {
                        tCard.click();
                    }
                }
            } else {
                showToast("warning", `La nota "${name}" no existe. Créala en Obsidian Desktop.`);
            }
        });
        
        // Hover popovers
        let hoverTimeout = null;
        let popoverEl = null;
        
        a.addEventListener("mouseenter", (e) => {
            hoverTimeout = setTimeout(() => {
                const targetNote = Object.values(notes).find(n => n.title.toLowerCase() === name.toLowerCase());
                
                popoverEl = document.createElement("div");
                popoverEl.className = "wikilink-popover glass";
                
                const rect = a.getBoundingClientRect();
                popoverEl.style.top = `${rect.bottom + window.scrollY + 6}px`;
                popoverEl.style.left = `${rect.left + window.scrollX}px`;
                
                // DOMPurify applied inside template strings
                if (targetNote) {
                    popoverEl.innerHTML = DOMPurify.sanitize(`
                        <div class="popover-header">
                            <span class="popover-title">${targetNote.title}</span>
                            <span class="note-category-badge ${targetNote.category}">${targetNote.category}</span>
                        </div>
                        <div class="popover-body">${targetNote.summary}</div>
                        <div class="popover-footer">
                            <span class="tag-pill">Links: ${targetNote.links.length}</span>
                            <span class="tag-pill">Backlinks: ${targetNote.backlinks.length}</span>
                        </div>
                    `);
                } else {
                    popoverEl.innerHTML = DOMPurify.sanitize(`
                        <div class="popover-header">
                            <span class="popover-title" style="color:var(--color-errors)">Enlace Roto</span>
                        </div>
                        <div class="popover-body">La nota "${name}" no existe en tu cerebro.</div>
                    `);
                }
                
                document.body.appendChild(popoverEl);
                setTimeout(() => popoverEl.classList.add("visible"), 20);
            }, 250);
        });
        
        a.addEventListener("mouseleave", () => {
            clearTimeout(hoverTimeout);
            if (popoverEl) {
                popoverEl.classList.remove("visible");
                const temp = popoverEl;
                setTimeout(() => temp.remove(), 200);
                popoverEl = null;
            }
        });
    });
}

function closeNoteView() {
    activeNote = null;
    viewNoteBadge.innerText = "--";
    viewNoteBadge.className = "note-category-badge";
    viewNoteTitle.innerText = "Selecciona una nota";
    viewNoteDates.innerText = "Creada: --/--/---- • Actualizada: --/--/----";
    viewNoteBody.innerHTML = `
        <div class="placeholder-text">
            <h3>🧠 Tu cerebro en red</h3>
            <p>Haz clic en cualquier evento de la cronología o aprueba un borrador en la bandeja de entrada para desplegar sus detalles, backlinks y mapa de conexiones locales.</p>
        </div>
    `;
    viewNoteTags.innerHTML = "";
    viewNoteBacklinks.innerHTML = '<li class="empty-backlinks">Ninguna nota enlaza aquí todavía.</li>';
    btnDeleteNote.disabled = true;
    btnOpenObsidianNote.disabled = true;
    
    const radarSection = document.getElementById("ego-radar-section");
    if (radarSection) radarSection.classList.add("hidden");
}

async function handleDeleteNote() {
    if (!activeNote) return;
    
    if (confirm(`¿Estás seguro de que quieres eliminar la nota "${activeNote.title}"?`)) {
        if (isOffline) {
            offlineQueue.push({
                type: 'delete',
                category: activeNote.category,
                filepath: activeNote.filename
            });
            localStorage.setItem("offline-queue", JSON.stringify(offlineQueue));
            showToast("warning", "Nota eliminada localmente (Cola offline).");
            closeNoteView();
            await loadData();
            return;
        }
        
        try {
            const url = `/api/notes/${activeNote.category}/${encodeURIComponent(activeNote.filename)}`;
            const res = await fetch(url, { method: "DELETE" });
            if (res.status === 423) {
                alert("Acción bloqueada: El archivo está abierto en Obsidian o bloqueado por Windows. Cierra el archivo y vuelve a intentarlo.");
                return;
            }
            closeNoteView();
            await loadData();
        } catch (e) {
            console.error("Failed to delete note:", e);
        }
    }
}

// --- CONNECTION RADAR (LOCAL EGO-GRAPH) ---
function drawConnectionRadar(notePath) {
    const canvasEl = document.getElementById("ego-graph-canvas");
    const radarSection = document.getElementById("ego-radar-section");
    if (!canvasEl) return;
    
    canvasEl.innerHTML = ""; // Clear canvas
    
    if (radarSection) radarSection.classList.remove("hidden");
    
    // getLinkId handles both string IDs and D3-resolved object references
    const getLinkId = (node) => {
        if (!node) return null;
        if (typeof node === 'object') return node.path || node.id || null;
        return node;
    };
    
    const centerNode = graphData.nodes.find(n => n.path === notePath || n.id === notePath);
    if (!centerNode) {
        // Show a minimal placeholder instead of hiding completely
        canvasEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:11px;flex-direction:column;gap:6px;"><span>🔮</span><span>Sin conexiones aún</span></div>`;
        return;
    }
    
    // Explore neighborhood
    const hop1 = new Set();
    const hop2 = new Set();
    const adjacentLinks = [];
    
    // Find 1-Hop connections
    graphData.links.forEach(l => {
        const s = getLinkId(l.source);
        const t = getLinkId(l.target);
        if (s === notePath) {
            hop1.add(t);
            adjacentLinks.push(l);
        } else if (t === notePath) {
            hop1.add(s);
            adjacentLinks.push(l);
        }
    });
    
    // Find 2-Hop connections if neighborhood limit (15 nodes) allows
    if (hop1.size + 1 < 12) {
        graphData.links.forEach(l => {
            const s = getLinkId(l.source);
            const t = getLinkId(l.target);
            if (hop1.has(s) && t !== notePath && !hop1.has(t)) {
                hop2.add(t);
                adjacentLinks.push(l);
            } else if (hop1.has(t) && s !== notePath && !hop1.has(s)) {
                hop2.add(s);
                adjacentLinks.push(l);
            }
        });
    }
    
    // Build node set combining center, 1-hop, and limited 2-hop nodes
    const nodeIds = new Set([notePath, ...hop1]);
    for (const id of hop2) {
        if (nodeIds.size >= 15) break;
        nodeIds.add(id);
    }
    
    // Map full node data
    const radarNodes = graphData.nodes.filter(n => nodeIds.has(n.path)).map(n => ({...n}));
    
    // Map links
    const radarLinks = adjacentLinks.filter(l => {
        const s = getLinkId(l.source);
        const t = getLinkId(l.target);
        return nodeIds.has(s) && nodeIds.has(t);
    }).map(l => ({
        source: getLinkId(l.source),
        target: getLinkId(l.target)
    }));
    
    const rawWidth = canvasEl.clientWidth;
    const rawHeight = canvasEl.clientHeight;
    const width = rawWidth > 20 ? rawWidth : 380;
    const height = rawHeight > 20 ? rawHeight : 200;
    
    const svg = d3.select(canvasEl)
        .append("svg")
        .attr("width", "100%")
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);
        
    const simulation = d3.forceSimulation(radarNodes)
        .force("link", d3.forceLink(radarLinks).id(d => d.path).distance(50))
        .force("charge", d3.forceManyBody().strength(-90))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(22));
        
    // Links lines
    const link = svg.append("g")
        .selectAll("line")
        .data(radarLinks)
        .enter()
        .append("line")
        .attr("stroke", "rgba(255, 255, 255, 0.15)")
        .attr("stroke-width", 1.5);
        
    // Nodes grouping
    const node = svg.append("g")
        .selectAll("g")
        .data(radarNodes)
        .enter()
        .append("g")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended))
        .on("click", (event, d) => {
            event.stopPropagation();
            const matchingNote = notes[d.path];
            if (matchingNote) openNote(matchingNote);
        });
        
    node.append("circle")
        .attr("r", d => d.path === notePath ? 8 : 5)
        .attr("fill", d => CATEGORY_COLORS[d.category] || "#ffffff")
        .attr("stroke", d => d.path === notePath ? "#fff" : "rgba(0,0,0,0.3)")
        .attr("stroke-width", d => d.path === notePath ? 2 : 1)
        .style("filter", d => d.path === notePath ? `drop-shadow(0px 0px 6px ${CATEGORY_COLORS[d.category] || "#bb9af7"})` : "none");
        
    node.append("text")
        .text(d => d.title)
        .attr("font-size", "9px")
        .attr("fill", "rgba(255, 255, 255, 0.85)")
        .attr("dx", 8)
        .attr("dy", 3)
        .attr("pointer-events", "none")
        .style("text-shadow", "0px 0px 4px #000, 0px 0px 4px #000");
        
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
            
        node
            .attr("transform", d => `translate(${d.x}, ${d.y})`);
    });
    
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    
    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    
    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
}

// --- GLOBAL FORCE GRAPH (MAPA GLOBAL) ---
function initGlobalGraph() {
    const canvasEl = document.getElementById("graph-canvas");
    if (!canvasEl || !graphData || graphData.nodes.length === 0) {
        if (canvasEl) {
            canvasEl.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--text-muted); flex-direction:column; gap:12px;">
                    <span style="font-size:36px;">🕸️</span>
                    <p style="font-size:12px; text-align:center;">Sin datos de grafo.<br>Crea notas con WikiLinks <code>[[Nota]]</code> para visualizar conexiones.</p>
                </div>
            `;
        }
        return;
    }
    
    canvasEl.innerHTML = "";
    
    const width = canvasEl.clientWidth || 600;
    const height = canvasEl.clientHeight || 400;
    
    // Filter nodes/links based on active category filters
    const filteredNodes = graphData.nodes.filter(n => activeCategoryFilters.includes(n.category));
    const filteredNodeIds = new Set(filteredNodes.map(n => n.path));
    const filteredLinks = graphData.links.filter(l => {
        const s = (typeof l.source === 'object') ? l.source.path || l.source.id : l.source;
        const t = (typeof l.target === 'object') ? l.target.path || l.target.id : l.target;
        return filteredNodeIds.has(s) && filteredNodeIds.has(t);
    }).map(l => ({
        source: (typeof l.source === 'object') ? l.source.path || l.source.id : l.source,
        target: (typeof l.target === 'object') ? l.target.path || l.target.id : l.target
    }));
    
    const nodesData = filteredNodes.map(n => ({...n}));
    
    const svg = d3.select(canvasEl)
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("background", "transparent");
    
    // Zoom & Pan
    const g = svg.append("g");
    svg.call(d3.zoom()
        .scaleExtent([0.1, 8])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );
    
    const simulation = d3.forceSimulation(nodesData)
        .force("link", d3.forceLink(filteredLinks).id(d => d.path).distance(80))
        .force("charge", d3.forceManyBody().strength(-120))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(20));
    
    // Arrow markers for directed links
    svg.append("defs").selectAll("marker")
        .data(["default"])
        .enter().append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 18)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "rgba(255,255,255,0.15)");
    
    const link = g.append("g")
        .selectAll("line")
        .data(filteredLinks)
        .enter().append("line")
        .attr("stroke", "rgba(255, 255, 255, 0.12)")
        .attr("stroke-width", 1)
        .attr("marker-end", "url(#arrowhead)");
    
    const node = g.append("g")
        .selectAll("g")
        .data(nodesData)
        .enter().append("g")
        .style("cursor", "pointer")
        .call(d3.drag()
            .on("start", (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x; d.fy = d.y;
            })
            .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
            .on("end", (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null; d.fy = null;
            })
        )
        .on("click", (event, d) => {
            event.stopPropagation();
            const matchingNote = notes[d.path];
            if (matchingNote) {
                openNote(matchingNote);
                // Highlight node
                node.selectAll("circle").attr("stroke-width", n => n.path === d.path ? 3 : 1.5);
            }
        })
        .on("mouseenter", function(event, d) {
            d3.select(this).select("circle")
                .transition().duration(150)
                .attr("r", d.path === d.path ? 11 : 8);
            
            // Show tooltip
            const tooltip = document.getElementById("graph-tooltip");
            if (tooltip) {
                tooltip.innerHTML = `<strong>${d.title}</strong><br><span style="color:${CATEGORY_COLORS[d.category] || '#fff'}">${d.category}</span>`;
                tooltip.style.opacity = "1";
                tooltip.style.left = (event.pageX + 12) + "px";
                tooltip.style.top = (event.pageY - 20) + "px";
            }
        })
        .on("mousemove", function(event) {
            const tooltip = document.getElementById("graph-tooltip");
            if (tooltip) {
                tooltip.style.left = (event.pageX + 12) + "px";
                tooltip.style.top = (event.pageY - 20) + "px";
            }
        })
        .on("mouseleave", function() {
            const tooltip = document.getElementById("graph-tooltip");
            if (tooltip) tooltip.style.opacity = "0";
        });
    
    node.append("circle")
        .attr("r", 7)
        .attr("fill", d => CATEGORY_COLORS[d.category] || "#7aa2f7")
        .attr("stroke", d => (CATEGORY_COLORS[d.category] || "#7aa2f7") + "88")
        .attr("stroke-width", 1.5)
        .style("filter", d => `drop-shadow(0px 0px 5px ${CATEGORY_COLORS[d.category] || "#7aa2f7"}88)`);
    
    node.append("text")
        .text(d => d.title && d.title.length > 22 ? d.title.substring(0, 22) + "…" : d.title)
        .attr("font-size", "9px")
        .attr("fill", "rgba(255, 255, 255, 0.7)")
        .attr("dx", 10)
        .attr("dy", 3)
        .attr("pointer-events", "none")
        .style("text-shadow", "0 0 4px #000, 0 0 4px #000");
    
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        node.attr("transform", d => `translate(${d.x}, ${d.y})`);
    });
    
    // Category filter checkboxes — bind ONCE only using a data flag
    document.querySelectorAll(".graph-filter-chk").forEach(chk => {
        if (chk.dataset.graphListenerBound) return;
        chk.dataset.graphListenerBound = "1";
        chk.addEventListener("change", () => {
            activeCategoryFilters = Array.from(document.querySelectorAll(".graph-filter-chk:checked"))
                .map(el => el.getAttribute("data-category"));
            globalGraphInitialized = false;
            initGlobalGraph();
            globalGraphInitialized = true;
        });
    });
    
    globalGraphInstance = { simulation, svg };
}

function updateGlobalGraph() {
    globalGraphInitialized = false;
    initGlobalGraph();
    globalGraphInitialized = true;
}

// --- GITHUB REMOTE SETUP ---
async function handleSetRemote() {
    const urlInput = document.getElementById("github-remote-url");
    const btn = document.getElementById("set-remote-btn");
    if (!urlInput) return;
    
    const remoteUrl = urlInput.value.trim();
    if (!remoteUrl) {
        showToast("warning", "Introduce la URL del repositorio de GitHub.");
        return;
    }
    
    // Basic validation - must look like a git URL
    if (!remoteUrl.includes("github.com") && !remoteUrl.includes(".git")) {
        showToast("warning", "Introduce una URL válida de GitHub (ej: https://github.com/user/repo.git).");
        return;
    }
    
    btn.disabled = true;
    btn.innerText = "Vinculando...";
    
    try {
        const res = await fetch("/api/git/set-remote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ remote_url: remoteUrl })
        });
        
        const result = await res.json();
        if (result.status === "success") {
            showToast("success", "✅ Repositorio de GitHub vinculado correctamente.");
            urlInput.value = "";
            // Refresh git status in settings
            const statusRes = await fetch("/api/git/status");
            const status = await statusRes.json();
            renderGitStatusCard(status);
        } else {
            showToast("error", `Error: ${result.message}`);
        }
    } catch (e) {
        showToast("error", "Fallo al vincular el repositorio.");
        console.error("Set remote failed:", e);
    } finally {
        btn.disabled = false;
        btn.innerText = "Vincular Repositorio";
    }
}

// --- OBSIDIAN DEEP LINK fallbacks ---
// Helper: opens any obsidian:// URI using an invisible <a> so the page never navigates away
function _launchObsidianUri(uri, fallbackDelay = 1800) {
    const a = document.createElement("a");
    a.href = uri;
    a.style.display = "none";
    document.body.appendChild(a);
    
    let fallbackTimer = setTimeout(() => {
        showObsidianFallbackCard(uri);
    }, fallbackDelay);
    
    const cancelFallback = () => {
        clearTimeout(fallbackTimer);
        window.removeEventListener("blur", cancelFallback);
    };
    window.addEventListener("blur", cancelFallback);
    
    a.click();
    setTimeout(() => a.remove(), 200);
    setTimeout(() => window.removeEventListener("blur", cancelFallback), fallbackDelay + 200);
}

function openNoteInObsidian(note) {
    if (!note) return;
    
    // Use vault-name URI so Obsidian doesn't need the path registered.
    // The vault folder name is "vault" (the last segment of the vault path).
    const vaultName = "vault";
    // note.path is like "ideas/My Note.md" — file= must be relative to vault root, without extension is also accepted
    const fileRelPath = note.path.replace(/\\/g, "/");
    const obsidianUri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(fileRelPath)}`;
    
    _launchObsidianUri(obsidianUri);
}

function openVaultInObsidian() {
    const vaultName = "vault";
    const obsidianUri = `obsidian://open?vault=${encodeURIComponent(vaultName)}`;
    
    _launchObsidianUri(obsidianUri);
}

function showObsidianFallbackCard(uri) {
    // Dismiss pre-existing fallbacks
    const existing = document.getElementById("obsidian-fallback-node");
    if (existing) existing.remove();
    
    const vaultPath = "c:\\Users\\Estudiante\\Downloads\\seond-brain\\vault";
    
    const div = document.createElement("div");
    div.id = "obsidian-fallback-node";
    div.className = "obsidian-fallback-card glass";
    
    div.innerHTML = `
        <div class="fallback-header">
            <h4>🟪 Configurar Vault de Obsidian</h4>
        </div>
        <div class="fallback-content">
            <p style="color:var(--color-warning); font-weight:600; font-size:11px;">⚠️ Obsidian no tiene el vault registrado.</p>
            <p style="margin-top:6px;">Realiza estos pasos <strong>una sola vez</strong>:</p>
            <ol style="padding-left: 16px; font-size:11px; margin-top: 6px; color:var(--text-muted); line-height:1.8;">
                <li>Abre <strong>Obsidian Desktop</strong></li>
                <li>Haz clic en <strong>"Abrir otro vault"</strong> (icono de bóveda)</li>
                <li>Selecciona <strong>"Abrir carpeta como vault"</strong></li>
                <li>Navega y selecciona esta carpeta:<br>
                    <code style="font-size:10px; word-break:break-all;">${vaultPath}</code>
                </li>
                <li>Una vez abierto el vault, el botón funcionará automáticamente ✅</li>
            </ol>
            <div style="display:flex; justify-content:space-between; margin-top:10px; gap:8px;">
                <button class="btn-dismiss" onclick="document.getElementById('obsidian-fallback-node').remove()">Cerrar</button>
                <button class="btn-primary" style="font-size:10px; padding:4px 8px;" onclick="navigator.clipboard.writeText('${vaultPath}'); showToast('success', 'Ruta copiada. Pégala en el selector de carpetas de Obsidian.');">Copiar Ruta</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

// --- SETTINGS AND THEME ---
async function openSettings() {
    settingsModal.classList.add("active");
    settingTokenInput.value = "Obteniendo token...";
    
    try {
        const resSettings = await fetch("/api/settings").catch(() => null);
        if (resSettings && resSettings.status === 200) {
            const settings = await resSettings.json();
            settingTokenInput.value = settings.ingest_token;
        } else {
            settingTokenInput.value = "INGEST_TOKEN (Server offline)";
        }
        
        const res = await fetch("/api/git/status");
        const status = await res.json();
        renderGitStatusCard(status);
        
    } catch (e) {
        console.error("Settings loading failed:", e);
    }
}

function renderGitStatusCard(status) {
    if (!status.has_remote) {
        gitStatusCard.innerHTML = `
            <p style="color:var(--color-warning)">⚠️ Sin repositorio remoto</p>
            <p>Tu cerebro está funcionando en modo local. Las notas se guardan en tu disco duro.</p>
        `;
        return;
    }
    
    gitStatusCard.innerHTML = `
        <p style="color:var(--color-success)">🟢 Repositorio Vinculado</p>
        <p><strong>URL Remota</strong>: ${status.remote_url}</p>
        <p><strong>Rama Activa</strong>: ${status.branch}</p>
        <p><strong>Cambios Locales</strong>: ${status.has_local_changes ? 'Sí (Pendiente de Sincronizar)' : 'No (Todo al día)'}</p>
    `;
}

function initTheme() {
    const savedTheme = localStorage.getItem("app-theme") || "cyber-noir";
    if (savedTheme === "minimal-dark") {
        document.body.classList.add("theme-minimal-dark");
    } else {
        document.body.classList.remove("theme-minimal-dark");
    }
}

function toggleTheme() {
    const isMinimal = document.body.classList.contains("theme-minimal-dark");
    if (isMinimal) {
        document.body.classList.remove("theme-minimal-dark");
        localStorage.setItem("app-theme", "cyber-noir");
    } else {
        document.body.classList.add("theme-minimal-dark");
        localStorage.setItem("app-theme", "minimal-dark");
    }
}

// --- GIT SYNC AND CONFLICT HANDLING ---
async function handleSync() {
    setSyncState("syncing");
    showToast("warning", "Iniciando copia de respaldo en segundo plano...");
    
    try {
        const res = await fetch("/api/git/sync", { method: "POST" });
        
        if (res.status === 409) {
            setSyncState("pending");
            showToast("error", "Ya hay una sincronización en curso.");
            return;
        }
        
        const result = await res.json();
        
        if (result.status === "success") {
            setSyncState("synced");
            showToast("success", result.message);
            await loadData();
        } else if (result.status === "conflict") {
            setSyncState("conflict");
            showToast("error", "Conflicto de sincronización detectado. Activando resolución Split-View.");
            // Open split resolution modal
            triggerConflictModal(result.conflicts[0] || "conflict-note.md");
        } else {
            setSyncState("pending");
            showToast("error", `Fallo: ${result.message}`);
        }
    } catch (e) {
        setSyncState("pending");
        showToast("error", "Fallo de red al intentar sincronizar.");
        console.error("Sync click error:", e);
    }
}

async function checkGitStatus() {
    try {
        const res = await fetch("/api/git/status");
        const status = await res.json();
        
        // Update header pill status
        if (status.has_local_changes) {
            setSyncState("pending");
        } else {
            setSyncState("synced");
        }
        
        // Update left panel telemetry git status card
        if (status.has_remote) {
            leftPanelGitStatus.innerHTML = `
                Branch: <code>${status.branch}</code><br/>
                Cambios locales: <code>${status.has_local_changes ? 'SÍ' : 'NO'}</code>
            `;
        } else {
            leftPanelGitStatus.innerHTML = `<span style="color:var(--color-warning)">Local (Sin origen remoto)</span>`;
        }
    } catch (e) {
        setSyncState("disconnected");
        leftPanelGitStatus.innerHTML = `<span style="color:var(--color-danger)">Servidor desconectado</span>`;
    }
}

function setSyncState(state) {
    syncBtn.className = "btn-sync";
    
    switch (state) {
        case "synced":
            syncBtn.classList.add("sync-synced");
            syncText.innerText = "Sincronizado";
            break;
        case "pending":
            syncBtn.classList.add("sync-pending");
            syncText.innerText = "Cambios Locales";
            break;
        case "syncing":
            syncBtn.classList.add("sync-syncing");
            syncText.innerText = "Sincronizando...";
            break;
        case "conflict":
            syncBtn.classList.add("sync-conflict");
            syncText.innerText = "Conflicto";
            break;
        case "disconnected":
        default:
            syncBtn.classList.remove("sync-synced", "sync-pending", "sync-syncing", "sync-conflict");
            syncText.innerText = "Sin Conexión";
            break;
    }
}

// Split-view Git Conflict Resolution Logic
async function triggerConflictModal(filepath) {
    currentConflictFilepath = filepath;
    conflictFilename.innerText = filepath;
    conflictModal.classList.add("active");
    
    localDiffContent.innerHTML = "Cargando versión local...";
    remoteDiffContent.innerHTML = "Cargando versión de la nube...";
    manualMergeTextarea.value = "";
    
    try {
        // Fetch conflict note raw contents
        const parts = filepath.split("/");
        const category = parts[0];
        const filename = parts.slice(1).join("/");
        
        const localRes = await fetch(`/api/notes/${category}/${encodeURIComponent(filename)}`);
        const localNote = await localRes.json();
        
        localDiffContent.innerHTML = DOMPurify.sanitize(`<pre style="margin:0; padding:0; background:none; border:none;"><code>${localNote.content}</code></pre>`);
        manualMergeTextarea.value = localNote.content;
        
        // Attempt to fetch origin remote note contents to render remote diff side-by-side
        // Since remote conflict files were renamed to Conflict timestamp copies, we lookup the corresponding copy
        const cloudCopyKey = Object.keys(notes).find(k => k.includes("Sync Conflict") && k.includes(filename.replace(".md", "")));
        if (cloudCopyKey) {
            const cloudNote = notes[cloudCopyKey];
            const cloudRes = await fetch(`/api/notes/${cloudNote.category}/${encodeURIComponent(cloudNote.filename)}`);
            const cloudData = await cloudRes.json();
            remoteDiffContent.innerHTML = DOMPurify.sanitize(`<pre style="margin:0; padding:0; background:none; border:none;"><code>${cloudData.content}</code></pre>`);
        } else {
            remoteDiffContent.innerHTML = "<i>No se pudo localizar copia conflictiva remota. Reconcilia localmente o manual.</i>";
        }
    } catch (e) {
        console.error("Conflict parser failed:", e);
        localDiffContent.innerHTML = "Error cargando nota conflictiva.";
    }
}

async function resolveConflict(type) {
    const payload = {
        filepath: currentConflictFilepath,
        resolution_type: type,
        manual_content: type === "manual" ? manualMergeTextarea.value : null
    };
    
    showToast("warning", "Enviando resolución de conflictos...");
    
    try {
        const res = await fetch("/api/git/resolve-conflict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        if (result.status === "success") {
            showToast("success", "Conflicto resuelto con éxito.");
            conflictModal.classList.remove("active");
            await loadData();
        } else {
            showToast("error", `Error resolviendo: ${result.message}`);
        }
    } catch (e) {
        showToast("error", "Fallo de red al enviar resolución de conflictos.");
        console.error("Resolve conflict click error:", e);
    }
}

// --- OFFLINE HEARTBEAT CHECKS ---
async function heartbeat() {
    try {
        const res = await fetch("/api/settings");
        if (res.status === 200) {
            if (isOffline) {
                isOffline = false;
                document.getElementById("offline-banner").classList.add("hidden");
                showToast("success", "Conexión restablecida. Sincronizando cola offline...");
                await syncOfflineQueue();
            } else {
                // Heartbeat succeeded, update git status in background
                checkGitStatus();
            }
        } else {
            enterOfflineMode();
        }
    } catch (e) {
        enterOfflineMode();
    }
}

function enterOfflineMode() {
    if (!isOffline) {
        isOffline = true;
        document.getElementById("offline-banner").classList.remove("hidden");
        showToast("error", "Servidor desconectado. Modo Offline activado.");
        setSyncState("disconnected");
        leftPanelGitStatus.innerHTML = `<span style="color:var(--color-danger)">Offline (Pausado)</span>`;
    }
}

async function syncOfflineQueue() {
    const queue = [...offlineQueue];
    offlineQueue = [];
    localStorage.removeItem("offline-queue");
    
    for (const task of queue) {
        try {
            if (task.type === 'delete') {
                await fetch(`/api/notes/${task.category}/${encodeURIComponent(task.filepath)}`, { method: "DELETE" });
            } else if (task.type === 'promote') {
                await fetch(`/api/notes/promote/${task.category}/${encodeURIComponent(task.filepath)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(task.payload)
                });
            } else if (task.type === 'metadata') {
                await fetch(`/api/notes/metadata/${task.category}/${encodeURIComponent(task.filepath)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(task.payload)
                });
            }
        } catch (e) {
            console.error("Offline task dispatch failed, re-queuing:", task, e);
            offlineQueue.push(task);
        }
    }
    
    if (offlineQueue.length > 0) {
        localStorage.setItem("offline-queue", JSON.stringify(offlineQueue));
    } else {
        showToast("success", "Cola offline procesada por completo.");
    }
    await loadData();
}

// --- SCoA DEBATE DELIBERATIONS ---
async function startScoaDebate() {
    const proposal = scoaProposal.value.trim();
    const category = scoaCategory.value;
    
    if (!proposal) {
        alert("Por favor, ingresa una propuesta técnica para debatir.");
        return;
    }
    
    scoaInputGroup.classList.add("hidden");
    scoaProgressContainer.classList.remove("hidden");
    scoaLiveStageTitle.textContent = "Conectando al Tribunal SCoA...";
    
    const judges = [
        { card: judgeSecurity, status: statusSecurity, stage: scoaStageSecurity, output: scoaOutputSecurity },
        { card: judgePerformance, status: statusPerformance, stage: scoaStagePerformance, output: scoaOutputPerformance },
        { card: judgeUiux, status: statusUiux, stage: scoaStageUiux, output: scoaOutputUiux },
        { card: judgeModerator, status: statusModerator, stage: scoaStageModerator, output: scoaOutputModerator }
    ];
    
    judges.forEach(j => {
        if (j.card) j.card.className = "judge-card";
        if (j.status) j.status.textContent = "Waiting";
        if (j.stage) j.stage.classList.add("hidden");
        if (j.output) j.output.innerHTML = "";
    });
    
    selectScoaTab("security");
    window.scoaStageTexts = { security: "", performance: "", uiux: "", moderator: "" };
    
    const url = `/api/debate/stream?proposal=${encodeURIComponent(proposal)}&category=${encodeURIComponent(category)}`;
    const eventSource = new EventSource(url);
    
    eventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            handleScoaEvent(data, category, eventSource);
        } catch (e) {
            console.error("Scoa stream parser error:", e);
        }
    };
    
    eventSource.onerror = function() {
        scoaLiveStageTitle.textContent = "Error de deliberación";
        showToast("error", "Conexión del tribunal perdida.");
        eventSource.close();
    };
}

function handleScoaEvent(event, category, eventSource) {
    if (event.error) {
        scoaLiveStageTitle.textContent = "Fallo del Tribunal";
        showToast("error", `Fallo: ${event.error}`);
        eventSource.close();
        return;
    }
    
    const stage = event.stage;
    
    if (event.status === "start") {
        updateJudgeUI(stage, "active");
        selectScoaTab(stage);
        
        let titleText = "Justices deliberating...";
        if (stage === "security") titleText = "Analizando Seguridad...";
        if (stage === "performance") titleText = "Evaluando Rendimiento...";
        if (stage === "uiux") titleText = "Evaluando UI/UX y Usabilidad...";
        if (stage === "moderator") titleText = "Sintetizando Fallo del Tribunal...";
        scoaLiveStageTitle.textContent = titleText;
    } else if (event.chunk) {
        window.scoaStageTexts[stage] = (window.scoaStageTexts[stage] || "") + event.chunk;
        const div = document.getElementById(`scoa-output-${stage}`);
        if (div) {
            div.innerHTML = renderMarkdown(window.scoaStageTexts[stage]);
        }
        if (scoaDebateRecord) {
            scoaDebateRecord.scrollTop = scoaDebateRecord.scrollHeight;
        }
    } else if (event.status === "done") {
        updateJudgeUI(stage, "done");
    } else if (stage === "file_write" && event.status === "saved") {
        eventSource.close();
        scoaLiveStageTitle.textContent = "Debate Guardado";
        showToast("success", `Fallo de SCoA registrado: ${event.filename}`);
        finalizeDebate(event.filename, category);
    }
}

function updateJudgeUI(stage, state) {
    const cardMap = {
        security: { card: judgeSecurity, status: statusSecurity, stageEl: scoaStageSecurity, suffix: "security" },
        performance: { card: judgePerformance, status: statusPerformance, stageEl: scoaStagePerformance, suffix: "performance" },
        uiux: { card: judgeUiux, status: statusUiux, stageEl: scoaStageUiux, suffix: "uiux" },
        moderator: { card: judgeModerator, status: statusModerator, stageEl: scoaStageModerator, suffix: "moderator" }
    };
    
    const info = cardMap[stage];
    if (!info) return;
    
    if (state === "active") {
        if (info.stageEl) info.stageEl.classList.remove("hidden");
        if (info.card) info.card.className = `judge-card active ${info.suffix}-active`;
        if (info.status) info.status.textContent = "Deliberando...";
    } else if (state === "done") {
        if (info.card) info.card.className = `judge-card done ${info.suffix}-done`;
        if (info.status) info.status.textContent = "Listo";
    }
}

async function finalizeDebate(filename, category) {
    await loadData();
    const match = Object.values(notes).find(n => n.category === category && n.filename.toLowerCase() === filename.toLowerCase());
    
    if (match) {
        openNote(match);
        setTimeout(() => {
            scoaModal.classList.remove("active");
        }, 1500);
    }
}

function selectScoaTab(stage) {
    const stages = ["security", "performance", "uiux", "moderator"];
    stages.forEach(s => {
        const el = document.getElementById(`scoa-stage-${s}`);
        const card = document.getElementById(`judge-${s}`);
        if (el) {
            if (s === stage) el.classList.remove("hidden");
            else el.classList.add("hidden");
        }
        if (card) {
            if (s === stage) card.classList.add("selected-tab");
            else card.classList.remove("selected-tab");
        }
    });
}

// Global slide-in toasts
function showToast(type, message) {
    const toast = document.createElement("div");
    toast.className = `toast-notification glass ${type}`;
    
    let color = "var(--color-ideas)";
    let title = "Notificación";
    if (type === "success") { color = "var(--color-success)"; title = "Éxito"; }
    if (type === "warning") { color = "var(--color-warning)"; title = "Alerta"; }
    if (type === "error") { color = "var(--color-danger)"; title = "Fallo"; }
    
    toast.innerHTML = `
        <div style="border-left: 3px solid ${color}; padding-left: 10px;">
            <strong style="color:${color}; font-size:12px; text-transform:uppercase;">${title}</strong>
            <p style="font-size:12px; margin-top:2px; color:var(--text-primary);">${message}</p>
        </div>
    `;
    
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.zIndex = "99999";
    toast.style.minWidth = "260px";
    toast.style.maxWidth = "360px";
    toast.style.padding = "10px 14px";
    toast.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    toast.style.transform = "translateY(50px)";
    toast.style.opacity = "0";
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transform = "translateY(0)";
        toast.style.opacity = "1";
    }, 20);
    
    setTimeout(() => {
        toast.style.transform = "translateY(20px)";
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 350);
    }, 4500);
}
