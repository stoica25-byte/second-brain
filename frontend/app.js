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
const judgeJurado = document.getElementById("judge-jurado");
const judgeFiscalia = document.getElementById("judge-fiscalia");
const judgeAnalistas = document.getElementById("judge-analistas");
const judgeTribunal = document.getElementById("judge-tribunal");
const judgeAbogado = document.getElementById("judge-abogado");

const statusJurado = document.getElementById("status-jurado");
const statusFiscalia = document.getElementById("status-fiscalia");
const statusAnalistas = document.getElementById("status-analistas");
const statusTribunal = document.getElementById("status-tribunal");
const statusAbogado = document.getElementById("status-abogado");

const scoaStageJurado = document.getElementById("scoa-stage-jurado");
const scoaStageFiscalia = document.getElementById("scoa-stage-fiscalia");
const scoaStageAnalistas = document.getElementById("scoa-stage-analistas");
const scoaStageTribunal = document.getElementById("scoa-stage-tribunal");
const scoaStageAbogado = document.getElementById("scoa-stage-abogado");

const scoaOutputJurado = document.getElementById("scoa-output-jurado");
const scoaOutputFiscalia = document.getElementById("scoa-output-fiscalia");
const scoaOutputAnalistas = document.getElementById("scoa-output-analistas");
const scoaOutputTribunal = document.getElementById("scoa-output-tribunal");
const scoaOutputAbogado = document.getElementById("scoa-output-abogado");

// Conflict resolution DOM elements
const conflictModal = document.getElementById("conflict-modal");
const conflictFilename = document.getElementById("conflict-filename");
const localDiffContent = document.getElementById("local-diff-content");
const remoteDiffContent = document.getElementById("remote-diff-content");
const manualMergeTextarea = document.getElementById("manual-merge-textarea");
const conflictBtnLocal = document.getElementById("conflict-btn-local");
const conflictBtnRemote = document.getElementById("conflict-btn-remote");
const conflictBtnManual = document.getElementById("conflict-btn-manual");

// Quick Capture and Top Tags elements
const btnQuickCapture = document.getElementById("btn-quick-capture");
const quickCaptureModal = document.getElementById("quick-capture-modal");
const captureClose = document.getElementById("capture-close");
const captureCancelBtn = document.getElementById("capture-cancel-btn");
const captureSaveBtn = document.getElementById("capture-save-btn");
const captureTitle = document.getElementById("capture-title");
const captureCategory = document.getElementById("capture-category");
const captureStatus = document.getElementById("capture-status");
const captureTags = document.getElementById("capture-tags");
const captureContent = document.getElementById("capture-content");
const topTagsContainer = document.getElementById("top-tags-container");

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
    if (judgeJurado) judgeJurado.addEventListener("click", () => selectScoaTab("jurado"));
    if (judgeFiscalia) judgeFiscalia.addEventListener("click", () => selectScoaTab("fiscalia"));
    if (judgeAnalistas) judgeAnalistas.addEventListener("click", () => selectScoaTab("analistas"));
    if (judgeTribunal) judgeTribunal.addEventListener("click", () => selectScoaTab("tribunal"));
    if (judgeAbogado) judgeAbogado.addEventListener("click", () => selectScoaTab("abogado"));
    
    // Quick Capture events
    if (btnQuickCapture) {
        btnQuickCapture.addEventListener("click", () => {
            quickCaptureModal.classList.add("active");
            captureTitle.value = "";
            captureContent.value = "";
            captureTags.value = "";
            captureCategory.value = "ideas";
            captureStatus.value = "draft";
            setTimeout(() => captureTitle.focus(), 100);
        });
    }
    if (captureClose) {
        captureClose.addEventListener("click", () => quickCaptureModal.classList.remove("active"));
    }
    if (captureCancelBtn) {
        captureCancelBtn.addEventListener("click", () => quickCaptureModal.classList.remove("active"));
    }
    if (captureSaveBtn) {
        captureSaveBtn.addEventListener("click", saveCapturedNote);
    }
    
    // Keyboard shortcuts (Ctrl+K to search, Ctrl+N to quick capture)
    window.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            if (quickCaptureModal) {
                quickCaptureModal.classList.add("active");
                captureTitle.value = "";
                captureContent.value = "";
                captureTags.value = "";
                captureCategory.value = "ideas";
                captureStatus.value = "draft";
                setTimeout(() => captureTitle.focus(), 100);
            }
        }
    });
    
    window.addEventListener("click", (e) => {
        if (e.target === scoaModal) scoaModal.classList.remove("active");
        if (e.target === conflictModal) conflictModal.classList.remove("active");
        if (e.target === quickCaptureModal) quickCaptureModal.classList.remove("active");
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
    
    // Left panel collapse toggle listener
    const toggleLeftBtn = document.getElementById("toggle-left-panel-btn");
    const panelLeft = document.querySelector(".panel-left");
    if (toggleLeftBtn && panelLeft) {
        toggleLeftBtn.addEventListener("click", () => {
            const isCollapsed = panelLeft.classList.toggle("collapsed");
            toggleLeftBtn.innerHTML = isCollapsed ? "▶" : "◀";
            if (isCollapsed) {
                toggleLeftBtn.style.left = "0px";
                toggleLeftBtn.setAttribute("title", "Expandir Panel Izquierdo");
            } else {
                toggleLeftBtn.style.left = "290px";
                toggleLeftBtn.setAttribute("title", "Contraer Panel Izquierdo");
            }
        });
    }

    // AI Semantic Link Optimizer Listeners
    const btnOptimizeVaultLinks = document.getElementById("btn-optimize-vault-links");
    if (btnOptimizeVaultLinks) {
        btnOptimizeVaultLinks.addEventListener("click", optimizeVaultLinks);
    }
    
    const btnSuggestNoteLinks = document.getElementById("btn-suggest-note-links");
    if (btnSuggestNoteLinks) {
        btnSuggestNoteLinks.addEventListener("click", suggestNoteLinks);
    }
    
    const previewLinksClose = document.getElementById("preview-links-close");
    const previewLinksModal = document.getElementById("preview-links-modal");
    if (previewLinksClose && previewLinksModal) {
        previewLinksClose.addEventListener("click", () => previewLinksModal.classList.remove("active"));
    }
    
    const previewLinksCancelBtn = document.getElementById("preview-links-cancel-btn");
    if (previewLinksCancelBtn && previewLinksModal) {
        previewLinksCancelBtn.addEventListener("click", () => previewLinksModal.classList.remove("active"));
    }
    
    const previewLinksConfirmBtn = document.getElementById("preview-links-confirm-btn");
    if (previewLinksConfirmBtn) {
        previewLinksConfirmBtn.addEventListener("click", confirmSuggestedLinks);
    }
    
    window.addEventListener("click", (e) => {
        if (e.target === previewLinksModal) previewLinksModal.classList.remove("active");
    });
}

// --- DATA LOADERS ---
async function loadData() {
    try {
        const response = await fetch("/api/index");
        const data = await response.json();
        
        notes = data.notes;
        graphData = data.graph;
        
        renderTopTags();
        
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
                    <div class="triage-title" id="triage-title-display-${safeId}" style="cursor: pointer; text-decoration: underline;" onclick="openDraftInViewer('${draft.category}', '${draft.filename.replace(/'/g, "\\'")}', '${draft.path.replace(/'/g, "\\'")}', '${draft.title.replace(/'/g, "\\'")}')" title="Haga clic para ver el contenido completo de la nota">${draft.title}</div>
                    <div class="triage-body markdown-body">${renderMarkdown(draft.content)}</div>
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

function openDraftInViewer(category, filename, path, title) {
    const draftNote = {
        category: category,
        filename: filename,
        path: path,
        title: title,
        tags: [],
        backlinks: []
    };
    openNote(draftNote);
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
                        <div class="timeline-card-body-inner markdown-body" id="timeline-body-${safePath}"></div>
                    </div>
                `;
                
                // Add click handler to select, open note, and toggle expansion
                card.addEventListener("click", (e) => {
                    if (e.target.tagName === 'A' || e.target.closest('a')) return;
                    
                    const isExpanded = card.classList.contains("expanded");
                    if (isExpanded) {
                        card.classList.remove("expanded");
                        const summaryEl = document.getElementById(`timeline-summary-${safePath}`);
                        if (summaryEl) summaryEl.style.display = "block";
                    } else {
                        const matchingNote = notes[event.path] || event;
                        openNote(matchingNote);
                    }
                });
                
                // Highlight if this is the currently active note
                if (activeNote && activeNote.path === event.path) {
                    card.classList.add("selected");
                }
                
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

function filterTimeline() {
    timelinePage = 1;
    loadTimeline(1, false);
}

// --- NOTE VIEWER & INSPECTOR ---
async function openNote(note) {
    activeNote = note;
    
    // Reset scroll position to top of Note Viewer
    if (noteViewer) {
        noteViewer.scrollTop = 0;
    }
    
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
        
        const safeId = getSafeId(note.path);
        let activeCard = null;
        if (note.status !== "draft" && note.status !== "unread") {
            activeCard = document.getElementById(`timeline-card-${safeId}`);
            
            // If the card is not found in the DOM, let's clear filters (search query & category filter) and reload
            if (!activeCard) {
                let filtersCleared = false;
                
                const categoryChk = document.querySelector(`.graph-filter-chk[data-category="${note.category}"]`);
                if (categoryChk && !categoryChk.checked) {
                    categoryChk.checked = true;
                    activeCategoryFilters = Array.from(
                        document.querySelectorAll(".graph-filter-chk:checked")
                    ).map(el => el.getAttribute("data-category"));
                    filtersCleared = true;
                }
                
                if (currentSearchQuery) {
                    currentSearchQuery = "";
                    if (searchInput) searchInput.value = "";
                    const clearSearchBtn = document.getElementById("clear-search-btn");
                    if (clearSearchBtn) clearSearchBtn.style.display = "none";
                    const countEl = document.getElementById("search-result-count");
                    if (countEl) countEl.style.display = "none";
                    filtersCleared = true;
                }
                
                if (filtersCleared) {
                    if (globalGraphInitialized) {
                        updateGlobalGraph();
                    }
                    await loadTimeline(1, false);
                    activeCard = document.getElementById(`timeline-card-${safeId}`);
                }
                
                // If still not found (e.g. because it's on page 2 or deeper), set search query to note title to force it onto page 1
                if (!activeCard) {
                    currentSearchQuery = note.title;
                    if (searchInput) searchInput.value = note.title;
                    const clearSearchBtn = document.getElementById("clear-search-btn");
                    if (clearSearchBtn) clearSearchBtn.style.display = "inline";
                    if (globalGraphInitialized) {
                        updateGlobalGraph();
                    }
                    await loadTimeline(1, false);
                    activeCard = document.getElementById(`timeline-card-${safeId}`);
                }
            }
        }
        
        // Render Note Viewer Body (Draft / Fallback or Outgoing Connections list)
        if (note.status === "draft" || note.status === "unread" || !activeCard) {
            // Show full note body text
            viewNoteBody.innerHTML = renderMarkdown(fullNote.content);
            bindWikiLinkPreviews(viewNoteBody);
        } else {
            // Show "Conectado a" connections list
            let connectionsHtml = `<h4>Conectado a</h4><ul class="connections-list">`;
            let hasLinks = false;
            if (note.links && note.links.length > 0) {
                note.links.forEach(targetPath => {
                    if (targetPath.startsWith("unresolved/")) {
                        const rawLink = targetPath.replace("unresolved/", "");
                        connectionsHtml += `<li class="connection-item unresolved">[[${rawLink}]] (roto)</li>`;
                        hasLinks = true;
                    } else {
                        const targetNote = notes[targetPath];
                        if (targetNote) {
                            connectionsHtml += `<li class="connection-item" data-path="${targetPath}" style="cursor:pointer; color:var(--color-primary); text-decoration:underline;">${targetNote.title}</li>`;
                            hasLinks = true;
                        }
                    }
                });
            }
            if (!hasLinks) {
                connectionsHtml += `<li class="empty-connections">Ninguna nota conectada.</li>`;
            }
            connectionsHtml += `</ul>`;
            
            viewNoteBody.innerHTML = connectionsHtml;
            
            // Add click listeners to connection items
            viewNoteBody.querySelectorAll(".connection-item").forEach(item => {
                item.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const path = item.getAttribute("data-path");
                    if (path && notes[path]) openNote(notes[path]);
                });
            });
        }
        
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
        const btnSuggestNoteLinks = document.getElementById("btn-suggest-note-links");
        if (btnSuggestNoteLinks) {
            btnSuggestNoteLinks.disabled = (note.status === "draft" || note.status === "unread");
        }
        
        // Render local Connection Radar Ego-Graph
        drawConnectionRadar(note.path);
        
        // Highlight corresponding node in global graph if visible
        if (window.d3) {
            d3.selectAll(".graph-node-group circle")
                .transition().duration(200)
                .attr("stroke-width", n => n.path === note.path ? 3.5 : 1.5)
                .attr("stroke", n => n.path === note.path ? "#ffffff" : (CATEGORY_COLORS[n.category] || "#7aa2f7") + "88")
                .attr("r", n => n.path === note.path ? 11 : 7)
                .style("filter", n => n.path === note.path 
                    ? `drop-shadow(0px 0px 8px ${CATEGORY_COLORS[n.category] || "#7aa2f7"})` 
                    : `drop-shadow(0px 0px 5px ${CATEGORY_COLORS[n.category] || "#7aa2f7"}88)`);
        }
        
        // Mark corresponding timeline card as selected, expand it, and scroll it into view
        document.querySelectorAll(".timeline-card").forEach(el => {
            if (el.id !== `timeline-card-${safeId}`) {
                el.classList.remove("selected", "expanded");
                const otherPath = el.id.replace("timeline-card-", "");
                const otherSum = document.getElementById(`timeline-summary-${otherPath}`);
                if (otherSum) otherSum.style.display = "block";
            }
        });
        
        if (activeCard) {
            // Temporarily disable transitions to instantly collapse other cards & expand this card to calculate exact heights
            if (timelineStream) {
                timelineStream.classList.add("no-transitions");
            }

            activeCard.classList.add("selected", "expanded");
            const summary = document.getElementById(`timeline-summary-${safeId}`);
            if (summary) summary.style.display = "none";
            const bodyInner = document.getElementById(`timeline-body-${safeId}`);
            if (bodyInner) {
                bodyInner.innerHTML = renderMarkdown(fullNote.content);
                bindWikiLinkPreviews(bodyInner);
            }
            
            // Force layout reflow so the browser updates all heights instantly
            activeCard.offsetHeight;

            // Calculate the exact target scroll position within timelineStream
            if (timelineStream) {
                const relativeTop = activeCard.getBoundingClientRect().top - timelineStream.getBoundingClientRect().top + timelineStream.scrollTop;
                // Add a small 10px offset for visual margin at the top
                const targetScroll = Math.max(0, relativeTop - 10);
                
                timelineStream.scrollTo({
                    top: targetScroll,
                    behavior: "smooth"
                });
            }
            
            // Restore transitions after a short delay so manual clicks still animate
            setTimeout(() => {
                if (timelineStream) {
                    timelineStream.classList.remove("no-transitions");
                }
            }, 350);
        }
        
        // Reset scroll position to top of Note Viewer after layout settles
        setTimeout(() => {
            if (noteViewer) noteViewer.scrollTop = 0;
        }, 150);
        
    } catch (e) {
        console.error("Inspector open note failed:", e);
    }
}

function normalizeString(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9]/g, "");     // Remove all non-alphanumeric chars
}

function renderMarkdown(mdText) {
    if (!mdText) return "<p><i>Contenido vacío</i></p>";
    
    console.log("renderMarkdown input:", mdText.substring(0, 100) + "...");
    
    // Parse WikiLinks: [[Target Note]] or [[Target Note|Alias]]
    let processed = mdText.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, alias) => {
        const noteName = target.trim();
        const display = alias ? alias.trim() : noteName;
        
        // Check target exists by matching normalized titles, filenames (without .md), or paths in database
        const exists = Object.values(notes).some(n => 
            normalizeString(n.title) === normalizeString(noteName) ||
            normalizeString(n.filename.replace(/\.md$/, "")) === normalizeString(noteName) ||
            normalizeString(n.path.replace(/\.md$/, "")) === normalizeString(noteName)
        );
        const className = exists ? "wikilink" : "wikilink broken";
        
        return `<a class="${className}" href="#" data-note="${noteName}">${display}</a>`;
    });
    
    try {
        const rawHtml = marked.parse(processed);
        console.log("marked.parse output (first 100 chars):", typeof rawHtml === 'string' ? rawHtml.substring(0, 100) : rawHtml);
        const sanitized = DOMPurify.sanitize(rawHtml);
        console.log("DOMPurify.sanitize output (first 100 chars):", sanitized.substring(0, 100));
        return sanitized;
    } catch (err) {
        console.error("Error during markdown parsing/sanitization:", err);
        return `<p style="color:red;">Error de renderizado: ${err.message}</p>`;
    }
}


function bindWikiLinkPreviews(container = document) {
    const anchors = container.querySelectorAll(".wikilink");
    anchors.forEach(a => {
        const name = a.getAttribute("data-note");
        
        const findTargetNote = () => {
            return Object.values(notes).find(n => 
                normalizeString(n.title) === normalizeString(name) ||
                normalizeString(n.filename.replace(/\.md$/, "")) === normalizeString(name) ||
                normalizeString(n.path.replace(/\.md$/, "")) === normalizeString(name)
            );
        };

        
        // Click action
        a.addEventListener("click", (e) => {
            e.preventDefault();
            const targetNote = findTargetNote();
            if (targetNote) {
                openNote(targetNote);
            } else {
                showToast("warning", `La nota "${name}" no existe. Créala en Obsidian Desktop.`);
            }
        });
        
        // Hover popovers
        let hoverTimeout = null;
        let popoverEl = null;
        
        a.addEventListener("mouseenter", (e) => {
            hoverTimeout = setTimeout(() => {
                const targetNote = findTargetNote();
                
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
    const btnSuggestNoteLinks = document.getElementById("btn-suggest-note-links");
    if (btnSuggestNoteLinks) btnSuggestNoteLinks.disabled = true;
    
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
    
    // getLinkId handles both string IDs and D3-resolved object references
    const getLinkId = (node) => {
        if (!node) return null;
        if (typeof node === 'object') return node.path || node.id || null;
        return node;
    };
    
    const centerNode = graphData.nodes.find(n => n.path === notePath || n.id === notePath);
    
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
    
    if (!centerNode || adjacentLinks.length === 0) {
        if (radarSection) radarSection.classList.add("hidden");
        return;
    }
    
    if (radarSection) radarSection.classList.remove("hidden");

    
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
    
    // 1. Helpers for type and connections degrees
    const degreeMap = {};
    nodesData.forEach(n => degreeMap[n.path] = 0);
    filteredLinks.forEach(l => {
        const s = (typeof l.source === 'object') ? l.source.path : l.source;
        const t = (typeof l.target === 'object') ? l.target.path : l.target;
        if (degreeMap[s] !== undefined) degreeMap[s]++;
        if (degreeMap[t] !== undefined) degreeMap[t]++;
    });

    const isMoc = d => d.title.toLowerCase().includes("moc") || d.title.toLowerCase().includes("welcome hub") || (d.tags && d.tags.some(t => t.includes("moc")));
    
    function getNodeRadius(d) {
        if (isMoc(d)) return 13;
        const isJournal = d.category === "journal" || d.title.toLowerCase().includes("sesion desarrollo") || (d.tags && d.tags.some(t => t.includes("journal")));
        if (isJournal) return 9;
        return 6.5;
    }

    const svg = d3.select(canvasEl)
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("background", "transparent");
    
    // Zoom & Pan
    const g = svg.append("g");
    const zoomBehavior = d3.zoom()
        .scaleExtent([0.05, 12])
        .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoomBehavior);
    
    // 2. forceSimulation setup with non-linear spring physics and collisions
    const simulation = d3.forceSimulation(nodesData)
        .force("link", d3.forceLink(filteredLinks).id(d => d.path)
            .distance(l => {
                const sNode = nodesData.find(n => n.path === (typeof l.source === 'object' ? l.source.path : l.source));
                const tNode = nodesData.find(n => n.path === (typeof l.target === 'object' ? l.target.path : l.target));
                return (sNode && isMoc(sNode)) || (tNode && isMoc(tNode)) ? 160 : 70;
            })
            .strength(l => {
                const sPath = typeof l.source === 'object' ? l.source.path : l.source;
                const tPath = typeof l.target === 'object' ? l.target.path : l.target;
                const sDeg = degreeMap[sPath] || 1;
                const tDeg = degreeMap[tPath] || 1;
                return 1.0 / Math.pow(Math.min(sDeg, tDeg), 0.8);
            })
        )
        .force("charge", d3.forceManyBody().strength(d => {
            const baseRepulsion = -100;
            const deg = degreeMap[d.path] || 0;
            let typeMultiplier = 1.0;
            const isJournal = d.category === "journal" || d.title.toLowerCase().includes("sesion desarrollo") || (d.tags && d.tags.some(t => t.includes("journal")));
            if (isMoc(d)) typeMultiplier = 4.0;
            else if (isJournal) typeMultiplier = 1.8;
            return baseRepulsion * typeMultiplier * (1 + deg * 0.12);
        }))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => {
            const r = getNodeRadius(d);
            const isJournal = d.category === "journal" || d.title.toLowerCase().includes("sesion desarrollo") || (d.tags && d.tags.some(t => t.includes("journal")));
            if (isMoc(d)) return r + 35;
            if (isJournal) return r + 22;
            return r + 14;
        }).iterations(1));
    
    // 3. Create linear gradients for bidirectional link color flows
    const defs = svg.append("defs");
    const categories = Object.keys(CATEGORY_COLORS);
    categories.forEach(sourceCat => {
        categories.forEach(targetCat => {
            const gradId = `grad-${sourceCat}-${targetCat}`;
            if (defs.select(`#${gradId}`).empty()) {
                const grad = defs.append("linearGradient")
                    .attr("id", gradId)
                    .attr("x1", "0%")
                    .attr("y1", "0%")
                    .attr("x2", "100%")
                    .attr("y2", "0%");

                grad.append("stop")
                    .attr("offset", "0%")
                    .attr("stop-color", CATEGORY_COLORS[sourceCat])
                    .attr("stop-opacity", 0.4);

                grad.append("stop")
                    .attr("offset", "100%")
                    .attr("stop-color", CATEGORY_COLORS[targetCat])
                    .attr("stop-opacity", 0.4);
            }
        });
    });

    // Arrow markers for directed links
    defs.selectAll("marker")
        .data(["default"])
        .enter().append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 22)
        .attr("refY", 0)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "rgba(255,255,255,0.2)");
    
    const link = g.append("g")
        .selectAll("line")
        .data(filteredLinks)
        .enter().append("line")
        .attr("stroke", l => {
            const sCat = (typeof l.source === 'object') ? l.source.category : (nodesData.find(n => n.path === l.source)?.category || "ideas");
            const tCat = (typeof l.target === 'object') ? l.target.category : (nodesData.find(n => n.path === l.target)?.category || "ideas");
            return `url(#grad-${sCat}-${tCat})`;
        })
        .attr("stroke-width", 1.2)
        .attr("marker-end", "url(#arrowhead)");
    
    const node = g.append("g")
        .selectAll("g")
        .data(nodesData)
        .enter().append("g")
        .attr("class", d => isMoc(d) ? "graph-node-group node-is-moc" : "graph-node-group")
        .attr("data-path", d => d.path)
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
                focusOnNode(d.path);
            }
        })
        .on("mouseenter", function(event, d) {
            const connectedNodeIds = new Set();
            connectedNodeIds.add(d.path);
            
            // Find all connected nodes
            filteredLinks.forEach(l => {
                const s = (typeof l.source === 'object') ? l.source.path : l.source;
                const t = (typeof l.target === 'object') ? l.target.path : l.target;
                if (s === d.path) {
                    connectedNodeIds.add(t);
                } else if (t === d.path) {
                    connectedNodeIds.add(s);
                }
            });
            
            // Set opacity muted class via GPU accelerated CSS transitions
            node.classed("is-muted", n => !connectedNodeIds.has(n.path));
            link.classed("is-muted", l => {
                const s = (typeof l.source === 'object') ? l.source.path : l.source;
                const t = (typeof l.target === 'object') ? l.target.path : l.target;
                return !(s === d.path || t === d.path);
            });
            
            // Focus resizing
            d3.select(this).select("circle")
                .transition().duration(150)
                .attr("r", n => getNodeRadius(n) * 1.35)
                .attr("stroke-width", 3);
            
            // Update HUD metadata
            const outLinks = filteredLinks.filter(l => (typeof l.source === 'object' ? l.source.path : l.source) === d.path).length;
            const inLinks = filteredLinks.filter(l => (typeof l.target === 'object' ? l.target.path : l.target) === d.path).length;
            
            const hudDetails = document.getElementById("hud-node-details");
            if (hudDetails) {
                const color = CATEGORY_COLORS[d.category] || "#fff";
                hudDetails.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <div style="font-size:11px; font-weight:700; color:#fff; word-break:break-all;">${d.title}</div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="hud-meta-badge" style="background: ${color}22; color: ${color}; border: 1px solid ${color}40;">${d.category}</span>
                            <span style="font-size:9px;">Conexiones: ${inLinks} In / ${outLinks} Out</span>
                        </div>
                        <div style="color:var(--text-muted); font-size:9px; line-height:1.4; border-top:1px solid rgba(255,255,255,0.05); padding-top:6px; font-family: 'JetBrains Mono', monospace;">
                            Fuerza Física (vx): ${d.vx ? d.vx.toFixed(4) : "0.0000"}<br>
                            Coordenadas (x,y): ${d.x.toFixed(1)}, ${d.y.toFixed(1)}
                        </div>
                    </div>
                `;
            }

            // Show tooltip
            const tooltip = document.getElementById("graph-tooltip");
            if (tooltip) {
                tooltip.innerHTML = `<strong>${d.title}</strong><br><span style="color:${CATEGORY_COLORS[d.category] || '#fff'}">${d.category}</span>`;
                tooltip.style.opacity = "1";
                tooltip.style.left = (event.pageX + 12) + "px";
                tooltip.style.top = (event.pageY - 20) + "px";
            }
        })
        .on("mouseleave", function(event, d) {
            node.classed("is-muted", false);
            link.classed("is-muted", false);
            
            d3.select(this).select("circle")
                .transition().duration(150)
                .attr("r", n => getNodeRadius(n))
                .attr("stroke-width", 1.5);
                
            const tooltip = document.getElementById("graph-tooltip");
            if (tooltip) tooltip.style.opacity = "0";
        });
    
    // 4. MOC Pulse Ring
    node.filter(d => isMoc(d))
        .append("circle")
        .attr("class", "moc-pulse-ring")
        .attr("r", d => getNodeRadius(d))
        .attr("fill", "none")
        .attr("stroke", d => CATEGORY_COLORS[d.category] || "#7aa2f7")
        .attr("stroke-width", 1.5)
        .style("pointer-events", "none");
    
    // Core circle
    node.append("circle")
        .attr("r", d => getNodeRadius(d))
        .attr("fill", d => CATEGORY_COLORS[d.category] || "#7aa2f7")
        .attr("stroke", d => (CATEGORY_COLORS[d.category] || "#7aa2f7") + "88")
        .attr("stroke-width", 1.5)
        .style("filter", d => {
            const color = CATEGORY_COLORS[d.category] || "#7aa2f7";
            return isMoc(d) ? `drop-shadow(0px 0px 8px ${color}dd)` : `drop-shadow(0px 0px 3px ${color}55)`;
        });
    
    // Labels
    node.append("text")
        .text(d => d.title && d.title.length > 22 ? d.title.substring(0, 22) + "…" : d.title)
        .attr("font-size", d => isMoc(d) ? "10px" : "9px")
        .attr("font-weight", d => isMoc(d) ? "bold" : "normal")
        .attr("fill", d => isMoc(d) ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.6)")
        .attr("dx", d => isMoc(d) ? 16 : 10)
        .attr("dy", 3.5)
        .attr("pointer-events", "none")
        .style("text-shadow", "0 0 4px #000, 0 0 4px #000");
    
    // 5. Focal zooming and wave pings
    function focusOnNode(nodePath) {
        const targetNode = nodesData.find(n => n.path === nodePath);
        if (!targetNode) return;
        
        const scale = 1.8;
        const transform = d3.zoomIdentity
            .translate(width / 2 - targetNode.x * scale, height / 2 - targetNode.y * scale)
            .scale(scale);

        svg.transition()
            .duration(850)
            .ease(d3.easeCubicOut)
            .call(zoomBehavior.transform, transform);

        // Focal expandable ping
        const pingG = g.append("g");
        pingG.append("circle")
            .attr("class", "focus-ping-ring")
            .attr("cx", targetNode.x)
            .attr("cy", targetNode.y)
            .attr("fill", "none")
            .attr("stroke", CATEGORY_COLORS[targetNode.category] || "#7aa2f7")
            .style("pointer-events", "none");

        setTimeout(() => pingG.remove(), 1600);
    }
    
    // 6. Mathematical Bounding-Box Auto-Fit encadrer
    function fitGraphToContainer(duration = 750) {
        if (nodesData.length === 0) return;
        
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodesData.forEach(d => {
            if (d.x < minX) minX = d.x;
            if (d.x > maxX) maxX = d.x;
            if (d.y < minY) minY = d.y;
            if (d.y > maxY) maxY = d.y;
        });
        
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        if (graphWidth === 0 || graphHeight === 0) return;
        
        const scale = Math.max(0.15, Math.min(2.2, 0.80 / Math.max(graphWidth / width, graphHeight / height)));
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        const transform = d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-centerX, -centerY);
            
        if (duration > 0) {
            svg.transition()
                .duration(duration)
                .call(zoomBehavior.transform, transform);
        } else {
            svg.call(zoomBehavior.transform, transform);
        }
    }

    // Tick update alignment
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x}, ${d.y})`);
    });
    
    // 7. Cold Start (Synchronous simulation warming)
    simulation.stop();
    for (let i = 0; i < 75; ++i) {
        simulation.tick();
    }
    simulation.restart();

    // Auto-fit immediately on load
    fitGraphToContainer(0);

    // 8. Bind HUD search local bar
    const hudSearch = document.getElementById("hud-graph-search");
    const hudSearchBtn = document.getElementById("hud-graph-search-btn");
    
    if (hudSearch && hudSearchBtn) {
        const runHudSearch = () => {
            const term = hudSearch.value.trim().toLowerCase();
            if (!term) return;
            
            const foundNode = nodesData.find(n => n.title.toLowerCase().includes(term));
            if (foundNode) {
                focusOnNode(foundNode.path);
                const matchingNote = notes[foundNode.path];
                if (matchingNote) openNote(matchingNote);
            } else {
                hudSearch.style.borderColor = "var(--color-errors)";
                setTimeout(() => hudSearch.style.borderColor = "rgba(255,255,255,0.1)", 1500);
            }
        };

        hudSearchBtn.onclick = runHudSearch;
        hudSearch.onkeypress = (e) => {
            if (e.key === "Enter") runHudSearch();
        };
    }
    
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
        { card: judgeJurado, status: statusJurado, stage: scoaStageJurado, output: scoaOutputJurado },
        { card: judgeFiscalia, status: statusFiscalia, stage: scoaStageFiscalia, output: scoaOutputFiscalia },
        { card: judgeAnalistas, status: statusAnalistas, stage: scoaStageAnalistas, output: scoaOutputAnalistas },
        { card: judgeTribunal, status: statusTribunal, stage: scoaStageTribunal, output: scoaOutputTribunal },
        { card: judgeAbogado, status: statusAbogado, stage: scoaStageAbogado, output: scoaOutputAbogado }
    ];
    
    judges.forEach(j => {
        if (j.card) j.card.className = "judge-card";
        if (j.status) j.status.textContent = "Waiting";
        if (j.stage) j.stage.classList.add("hidden");
        if (j.output) j.output.innerHTML = "";
    });
    
    selectScoaTab("jurado");
    window.scoaStageTexts = { jurado: "", fiscalia: "", analistas: "", tribunal: "", abogado: "" };
    
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
    const stageKey = stage === "dictamen" ? "abogado" : stage;
    
    if (event.status === "start") {
        updateJudgeUI(stageKey, "active");
        selectScoaTab(stageKey);
        
        let titleText = "Justices deliberating...";
        if (stage === "jurado") titleText = "Analizando Cohesión...";
        if (stage === "fiscalia") titleText = "Desmantelando propuesta...";
        if (stage === "analistas") titleText = "Investigando en internet (Deep Research)...";
        if (stage === "tribunal") titleText = "Preparando el expediente...";
        if (stage === "dictamen") titleText = "Dictando Veredicto Final...";
        scoaLiveStageTitle.textContent = titleText;
    } else if (event.chunk) {
        window.scoaStageTexts[stageKey] = (window.scoaStageTexts[stageKey] || "") + event.chunk;
        const div = document.getElementById(`scoa-output-${stageKey}`);
        if (div) {
            div.innerHTML = renderMarkdown(window.scoaStageTexts[stageKey]);
        }
        if (scoaDebateRecord) {
            scoaDebateRecord.scrollTop = scoaDebateRecord.scrollHeight;
        }
    } else if (event.status === "done") {
        updateJudgeUI(stageKey, "done");
    } else if (stage === "file_write" && event.status === "saved") {
        eventSource.close();
        scoaLiveStageTitle.textContent = "Debate Guardado";
        showToast("success", `Fallo de SCoA registrado: ${event.filename}`);
        finalizeDebate(event.filename, category);
    }
}

function updateJudgeUI(stage, state) {
    const cardMap = {
        jurado: { card: judgeJurado, status: statusJurado, stageEl: scoaStageJurado, suffix: "jurado" },
        fiscalia: { card: judgeFiscalia, status: statusFiscalia, stageEl: scoaStageFiscalia, suffix: "fiscalia" },
        analistas: { card: judgeAnalistas, status: statusAnalistas, stageEl: scoaStageAnalistas, suffix: "analistas" },
        tribunal: { card: judgeTribunal, status: statusTribunal, stageEl: scoaStageTribunal, suffix: "tribunal" },
        abogado: { card: judgeAbogado, status: statusAbogado, stageEl: scoaStageAbogado, suffix: "abogado" }
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
    const stages = ["jurado", "fiscalia", "analistas", "tribunal", "abogado"];
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

// Renders the top tags widget in the left panel
function renderTopTags() {
    if (!topTagsContainer) return;
    
    const tagCounts = {};
    Object.values(notes).forEach(note => {
        if (note.tags && Array.isArray(note.tags)) {
            note.tags.forEach(tag => {
                const cleanedTag = tag.trim().toLowerCase();
                if (cleanedTag) {
                    tagCounts[cleanedTag] = (tagCounts[cleanedTag] || 0) + 1;
                }
            });
        }
    });
    
    // Sort tags by frequency desc
    const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
        
    topTagsContainer.innerHTML = "";
    if (sortedTags.length === 0) {
        topTagsContainer.innerHTML = `<span style="font-size: 10px; color: var(--text-muted); padding: 4px;">Sin etiquetas</span>`;
        return;
    }
    
    sortedTags.forEach(([tag, count]) => {
        const tagEl = document.createElement("div");
        tagEl.className = "top-tag-item";
        tagEl.innerHTML = `
            <span class="tag-name">#${tag}</span>
            <span class="tag-count">${count}</span>
        `;
        tagEl.addEventListener("click", () => {
            searchInput.value = `#${tag}`;
            currentSearchQuery = `#${tag}`;
            const clearBtn = document.getElementById("clear-search-btn");
            if (clearBtn) clearBtn.style.display = "inline";
            filterTimeline();
            searchInput.focus();
        });
        topTagsContainer.appendChild(tagEl);
    });
}

// Sends captured note details to FastAPI backend
async function saveCapturedNote() {
    const title = captureTitle.value.trim();
    const category = captureCategory.value;
    const status = captureStatus.value;
    const tagsString = captureTags.value.trim();
    const content = captureContent.value.trim();
    
    if (!title) {
        showToast("error", "El título es obligatorio");
        captureTitle.focus();
        return;
    }
    if (!content) {
        showToast("error", "El contenido en Markdown es obligatorio");
        captureContent.focus();
        return;
    }
    
    const tags = tagsString ? tagsString.split(",").map(t => t.trim()).filter(t => t) : [];
    
    captureSaveBtn.disabled = true;
    captureSaveBtn.innerText = "Guardando...";
    
    try {
        const response = await fetch("/api/notes/capture", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                title,
                category,
                content,
                tags,
                status
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast("success", "¡Nota capturada con éxito!");
            quickCaptureModal.classList.remove("active");
            
            // Clean values
            captureTitle.value = "";
            captureTags.value = "";
            captureContent.value = "";
            
            // Reload index, notes, and rebuild tags
            await loadData();
        } else {
            showToast("error", "Fallo al guardar: " + (data.detail || "Error desconocido"));
        }
    } catch (e) {
        console.error(e);
        showToast("error", "Error de red al guardar la nota");
    } finally {
        captureSaveBtn.disabled = false;
        captureSaveBtn.innerText = "Guardar Nota";
    }
}

// --- AI SEMANTIC OPTIMIZER FUNCTIONS ---

async function optimizeVaultLinks() {
    const btn = document.getElementById("btn-optimize-vault-links");
    const progressPanel = document.getElementById("optimize-progress-panel");
    const progressStatus = document.getElementById("optimize-progress-status");
    const progressCounter = document.getElementById("optimize-progress-counter");
    const progressBar = document.getElementById("optimize-progress-bar");

    if (!confirm("¿Deseas optimizar semánticamente las conexiones de la red? Esto analizará mediante IA las notas activas con menos conexiones para enlazarlas de forma inteligente.")) {
        return;
    }

    try {
        btn.disabled = true;
        btn.innerText = "⚡ OPTIMIZANDO...";
        if (progressPanel) {
            progressPanel.classList.remove("hidden");
            progressPanel.style.display = "flex";
            progressStatus.innerText = "Consultando IA...";
            progressCounter.innerText = "Procesando...";
            progressBar.style.width = "40%";
        }

        const response = await fetch("/api/notes/optimize-links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ limit: 5 })
        });
        const data = await response.json();

        if (response.ok && data.status !== "error") {
            if (progressBar) progressBar.style.width = "100%";
            if (progressStatus) progressStatus.innerText = "¡Completado!";
            
            const processedCount = data.processed ? data.processed.filter(p => p.status === "optimized").length : 0;
            showToast("success", `Optimización semántica completada. Notas enlazadas: ${processedCount}`);
            
            // Mark global graph as needing update
            globalGraphInitialized = false;
            
            await loadData();
        } else {
            showToast("error", "Fallo en la optimización: " + (data.error || data.detail || "Error desconocido"));
        }
    } catch (e) {
        console.error(e);
        showToast("error", "Error de red al optimizar conexiones de red.");
    } finally {
        setTimeout(() => {
            if (progressPanel) {
                progressPanel.classList.add("hidden");
                progressPanel.style.display = "none";
            }
            btn.disabled = false;
            btn.innerText = "⚡ OPTIMIZAR RED (IA)";
        }, 2000);
    }
}

async function suggestNoteLinks() {
    if (!activeNote) return;
    const btn = document.getElementById("btn-suggest-note-links");
    const previewModal = document.getElementById("preview-links-modal");
    const container = document.getElementById("preview-links-list-container");
    const emptyPlaceholder = document.getElementById("preview-links-empty");

    try {
        btn.disabled = true;
        btn.innerText = "✨ Buscando...";

        const response = await fetch("/api/notes/optimize-links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                category: activeNote.category,
                filepath: activeNote.filename
            })
        });
        const data = await response.json();

        if (response.ok && data.status === "preview") {
            container.innerHTML = "";
            previewModal.dataset.category = activeNote.category;
            previewModal.dataset.filepath = activeNote.filename;

            if (data.suggestions && data.suggestions.length > 0) {
                emptyPlaceholder.classList.add("hidden");
                data.suggestions.forEach((sug, i) => {
                    const item = document.createElement("div");
                    item.className = "preview-link-item";
                    item.innerHTML = `
                        <input type="checkbox" id="chk-sug-${i}" value="${sug}" checked>
                        <label for="chk-sug-${i}" class="preview-link-label">
                            <span class="preview-link-badge">ENLACE</span>
                            ${sug}
                        </label>
                    `;
                    item.addEventListener("click", (e) => {
                        if (e.target.tagName !== "INPUT") {
                            const chk = item.querySelector("input[type='checkbox']");
                            if (chk) chk.checked = !chk.checked;
                        }
                    });
                    container.appendChild(item);
                });
            } else {
                emptyPlaceholder.classList.remove("hidden");
            }
            previewModal.classList.add("active");
        } else {
            showToast("error", "Fallo al obtener sugerencias: " + (data.detail || "Error desconocido"));
        }
    } catch (e) {
        console.error(e);
        showToast("error", "Error de red al consultar la IA.");
    } finally {
        btn.disabled = false;
        btn.innerText = "✨ Sugerir Enlaces (IA)";
    }
}

async function confirmSuggestedLinks() {
    const previewModal = document.getElementById("preview-links-modal");
    const confirmBtn = document.getElementById("preview-links-confirm-btn");
    const category = previewModal.dataset.category;
    const filepath = previewModal.dataset.filepath;

    if (!category || !filepath) return;

    // Get checked suggestions
    const checkboxes = previewModal.querySelectorAll("#preview-links-list-container input[type='checkbox']:checked");
    const confirmedLinks = Array.from(checkboxes).map(chk => chk.value);

    try {
        confirmBtn.disabled = true;
        confirmBtn.innerText = "Guardando...";

        const response = await fetch("/api/notes/optimize-links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                category,
                filepath,
                confirmed_links: confirmedLinks
            })
        });
        const data = await response.json();

        if (response.ok && data.status === "success") {
            showToast("success", `¡Enlaces guardados con éxito!`);
            previewModal.classList.remove("active");
            
            // Mark global graph as needing update
            globalGraphInitialized = false;
            
            await loadData();
        } else {
            showToast("error", "Fallo al guardar enlaces: " + (data.detail || "Error desconocido"));
        }
    } catch (e) {
        console.error(e);
        showToast("error", "Error de red al guardar los enlaces confirmados.");
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerText = "Confirmar Enlaces";
    }
}

