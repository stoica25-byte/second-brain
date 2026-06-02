// State variables
let notes = {};
let graphData = { nodes: [], links: [] };
let activeNote = null;
let selectedGraphNode = null;
let lastClickTime = 0;
let lastClickedNodeId = null;
let currentSearchQuery = "";
let activeCategoryFilters = ["ideas", "skills", "errors", "journal", "sources"];
let graphInstance = null;
let autocompleteActive = false;
let autocompleteStartIndex = -1;

// Category colors for graph (must match CSS variables)
const CATEGORY_COLORS = {
    ideas: "#bb9af7",      // Lavender
    skills: "#73daca",     // Neon Teal
    errors: "#f7768e",     // Coral Red
    journal: "#7aa2f7",    // Ice Blue
    sources: "#e0af68"     // Amber Gold
};

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
const statMaturity = document.getElementById("stat-maturity");
const statVelocity = document.getElementById("stat-velocity");
const inboxCard = document.getElementById("inbox-card");
const inboxCount = document.getElementById("inbox-count");
const inboxList = document.getElementById("inbox-list");

const newNoteBtn = document.getElementById("new-note-btn");
const dailyNoteBtn = document.getElementById("daily-note-btn");
const searchInfo = document.getElementById("search-info");
const searchCount = document.getElementById("search-count");
const clearSearchBtn = document.getElementById("clear-search-btn");

const listIdeas = document.getElementById("list-ideas");
const listSkills = document.getElementById("list-skills");
const listErrors = document.getElementById("list-errors");
const listJournal = document.getElementById("list-journal");
const listSources = document.getElementById("list-sources");

// Note view DOMs
const noteViewer = document.getElementById("note-viewer");
const viewNoteBadge = document.getElementById("view-note-badge");
const viewNoteTitle = document.getElementById("view-note-title");
const viewNoteDates = document.getElementById("view-note-dates");
const viewNoteBody = document.getElementById("view-note-body");
const viewNoteTags = document.getElementById("view-note-tags");
const viewNoteBacklinks = document.getElementById("view-note-backlinks");
const editNoteBtn = document.getElementById("btn-edit-note");
const deleteNoteBtn = document.getElementById("btn-delete-note");

// Curation HUD
const curationHud = document.getElementById("curation-hud");
const hudSourceType = document.getElementById("hud-source-type");
const hudSourceUrl = document.getElementById("hud-source-url");
const hudBtnRead = document.getElementById("hud-btn-read");
const hudBtnPromoteIdea = document.getElementById("hud-btn-promote-idea");
const hudBtnPromoteSkill = document.getElementById("hud-btn-promote-skill");

// Editor DOMs
const noteEditor = document.getElementById("note-editor");
const editNoteTitle = document.getElementById("edit-note-title");
const editNoteCategory = document.getElementById("edit-note-category");
const editNoteTags = document.getElementById("edit-note-tags");
const editNoteStatus = document.getElementById("edit-note-status");
const editNoteContent = document.getElementById("edit-note-content");
const autocompleteDrawer = document.getElementById("autocomplete-drawer");
const saveNoteBtn = document.getElementById("btn-save-note");
const cancelEditBtn = document.getElementById("btn-cancel-edit");

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

// Redesigned SCoA elements
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

// --- INITIALIZATION ---
window.addEventListener("DOMContentLoaded", async () => {
    // Setup marked configuration to bypass default link parsing if needed
    marked.setOptions({
        gfm: true,
        breaks: true
    });
    
    // Load theme preference
    initTheme();
    
    // Bind Event Listeners
    setupEventListeners();
    
    // Load initial data
    await loadData();
    
    // Check initial git status in background
    checkGitStatus();
});

// Setup UI interactions
function setupEventListeners() {
    // Search filter
    searchInput.addEventListener("input", (e) => {
        currentSearchQuery = e.target.value.toLowerCase().trim();
        filterNotes();
    });
    
    clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        currentSearchQuery = "";
        filterNotes();
    });
    
    // Sync buttons
    syncBtn.addEventListener("click", handleSync);
    
    // Settings modal triggers
    settingsBtn.addEventListener("click", openSettings);
    settingsClose.addEventListener("click", () => settingsModal.classList.remove("active"));
    window.addEventListener("click", (e) => {
        if (e.target === settingsModal) settingsModal.classList.remove("active");
    });
    
    copyTokenBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(settingTokenInput.value);
        copyTokenBtn.innerText = "Copiado";
        setTimeout(() => copyTokenBtn.innerText = "Copiar", 2000);
    });
    
    reindexBtn.addEventListener("click", async () => {
        reindexBtn.innerText = "Indexando...";
        await fetch("/api/index/rebuild", { method: "POST" });
        await loadData();
        reindexBtn.innerText = "Forzar Re-indexar Cerebro";
    });
    
    // Category visual checkboxes
    document.querySelectorAll(".chk-container input").forEach(chk => {
        chk.addEventListener("change", () => {
            const category = chk.getAttribute("data-category");
            if (chk.checked) {
                if (!activeCategoryFilters.includes(category)) activeCategoryFilters.push(category);
            } else {
                activeCategoryFilters = activeCategoryFilters.filter(c => c !== category);
            }
            updateGraphFilters();
        });
    });
    
    // Folder collapse arrows toggle
    document.querySelectorAll(".folder-header").forEach(header => {
        header.addEventListener("click", () => {
            const folder = header.parentElement;
            folder.classList.toggle("collapsed");
        });
    });
    
    // CRUD Note operations
    newNoteBtn.addEventListener("click", () => startNewNote());
    dailyNoteBtn.addEventListener("click", () => openOrCreateDailyNote());
    editNoteBtn.addEventListener("click", () => startEditingNote());
    deleteNoteBtn.addEventListener("click", () => handleDeleteNote());
    cancelEditBtn.addEventListener("click", () => cancelEditing());
    saveNoteBtn.addEventListener("click", handleSaveNote);
    
    // Curation operations
    hudBtnRead.addEventListener("click", () => handleCurationAction("read"));
    hudBtnPromoteIdea.addEventListener("click", () => handleCurationAction("promote-idea"));
    hudBtnPromoteSkill.addEventListener("click", () => handleCurationAction("promote-skill"));
    
    // Editor helpers (Autocomplete wiki-links)
    editNoteContent.addEventListener("input", handleEditorInput);
    editNoteContent.addEventListener("keydown", handleEditorKeyDown);
    
    // Category selector shows status field only for errors
    editNoteCategory.addEventListener("change", (e) => {
        if (e.target.value === "errors") {
            editNoteStatus.classList.remove("hidden");
        } else {
            editNoteStatus.classList.add("hidden");
        }
    });

    // SCoA Debate modal events
    if (scoaTriggerBtn) {
        scoaTriggerBtn.addEventListener("click", () => {
            scoaModal.classList.add("active");
            scoaInputGroup.classList.remove("hidden");
            scoaProgressContainer.classList.add("hidden");
            scoaProposal.value = "";
        });
    }

    if (scoaClose) {
        scoaClose.addEventListener("click", () => {
            scoaModal.classList.remove("active");
        });
    }

    if (scoaStartBtn) {
        scoaStartBtn.addEventListener("click", startScoaDebate);
    }

    // SCoA Judge Card Tab Clicks
    if (judgeSecurity) judgeSecurity.addEventListener("click", () => selectScoaTab("security"));
    if (judgePerformance) judgePerformance.addEventListener("click", () => selectScoaTab("performance"));
    if (judgeUiux) judgeUiux.addEventListener("click", () => selectScoaTab("uiux"));
    if (judgeModerator) judgeModerator.addEventListener("click", () => selectScoaTab("moderator"));

    // Theme Toggle Click
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", toggleTheme);
    }

    window.addEventListener("click", (e) => {
        if (e.target === scoaModal) {
            scoaModal.classList.remove("active");
        }
    });
}

// Load brain database index
async function loadData() {
    try {
        const response = await fetch("/api/index");
        const data = await response.json();
        
        notes = data.notes;
        graphData = data.graph;
        
        updateStats();
        populateSidebarLists();
        updateInbox();
        
        // Render or update D3 graph canvas
        renderGraph();
        
        // Restore active note if it still exists
        if (activeNote) {
            const updated = Object.values(notes).find(n => n.title.toLowerCase() === activeNote.title.toLowerCase());
            if (updated) {
                openNote(updated);
            } else {
                closeNoteView();
            }
        }
    } catch (e) {
        console.error("Error loading brain data:", e);
    }
}

// Populate stats box
// Helper for Date diffs in Velocity
function isWithinLast7Days(dateStr) {
    if (!dateStr || dateStr.trim() === "" || dateStr === "n/a") return false;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    const midnightNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const midnightDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffTime = midnightNow - midnightDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
}

// Populate stats box
function updateStats() {
    const totalNotes = Object.keys(notes).length;
    statTotalNotes.innerText = totalNotes;
    statTotalLinks.innerText = graphData.links.length;

    // Maturity Index
    let connectedCount = 0;
    Object.values(notes).forEach(note => {
        const hasValidOutLinks = note.links && note.links.some(linkTitle => notes[linkTitle]);
        const hasInLinks = note.backlinks && note.backlinks.length > 0;
        if (hasValidOutLinks || hasInLinks) {
            connectedCount++;
        }
    });
    const maturityPct = totalNotes > 0 ? Math.round((connectedCount / totalNotes) * 100) : 0;
    statMaturity.innerText = maturityPct + "%";

    // Velocity
    let recentNotesCount = 0;
    Object.values(notes).forEach(note => {
        const isCreatedRecent = isWithinLast7Days(note.created);
        const isUpdatedRecent = isWithinLast7Days(note.updated);
        if (isCreatedRecent || isUpdatedRecent) {
            recentNotesCount++;
        }
    });
    statVelocity.innerText = recentNotesCount;

    // Top Tags
    updateTopTags();
}

function updateTopTags() {
    const topTagsList = document.getElementById("top-tags-list");
    if (!topTagsList) return;
    
    const tagCounts = {};
    Object.values(notes).forEach(note => {
        if (note.tags && Array.isArray(note.tags)) {
            note.tags.forEach(tag => {
                const cleanTag = tag.trim();
                if (cleanTag) {
                    tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
                }
            });
        }
    });
    
    const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5);
        
    topTagsList.innerHTML = "";
    if (sortedTags.length === 0) {
        const li = document.createElement("li");
        li.className = "empty-tags";
        li.innerText = "No tags recorded";
        topTagsList.appendChild(li);
        return;
    }
    
    sortedTags.forEach(([tag, count]) => {
        const li = document.createElement("li");
        li.className = "top-tag-item";
        
        const nameSpan = document.createElement("span");
        nameSpan.className = "tag-name";
        nameSpan.innerText = `#${tag}`;
        
        const countSpan = document.createElement("span");
        countSpan.className = "tag-count";
        countSpan.innerText = count;
        
        li.appendChild(nameSpan);
        li.appendChild(countSpan);
        topTagsList.appendChild(li);
    });
}

// Populate Folder contents
function populateSidebarLists() {
    // Clear list
    listIdeas.innerHTML = "";
    listSkills.innerHTML = "";
    listErrors.innerHTML = "";
    listJournal.innerHTML = "";
    listSources.innerHTML = "";
    
    Object.values(notes).forEach(note => {
        const li = document.createElement("li");
        li.innerText = note.title;
        li.setAttribute("data-title", note.title);
        li.addEventListener("click", () => openNote(note));
        
        if (activeNote && activeNote.title === note.title) {
            li.classList.add("active");
        }
        
        switch (note.category) {
            case "ideas":
                listIdeas.appendChild(li);
                break;
            case "skills":
                listSkills.appendChild(li);
                break;
            case "errors":
                listErrors.appendChild(li);
                break;
            case "journal":
                listJournal.appendChild(li);
                break;
            case "sources":
                listSources.appendChild(li);
                break;
        }
    });
}

// Update Inbox badge and contents
function updateInbox() {
    inboxList.innerHTML = "";
    
    // Find unread source files
    const unread = Object.values(notes).filter(n => n.category === "sources" && n.status === "unread");
    
    if (unread.length > 0) {
        inboxCard.classList.remove("hide-inbox");
        inboxCount.innerText = unread.length;
        
        unread.forEach(note => {
            const li = document.createElement("li");
            li.className = "inbox-item";
            li.addEventListener("click", () => openNote(note));
            
            const titleSpan = document.createElement("span");
            titleSpan.className = "inbox-item-title";
            titleSpan.innerText = note.title;
            
            const sourceSpan = document.createElement("span");
            sourceSpan.className = "inbox-item-source";
            sourceSpan.innerText = note.source_type || "External";
            
            li.appendChild(titleSpan);
            li.appendChild(sourceSpan);
            inboxList.appendChild(li);
        });
    } else {
        inboxCard.classList.add("hide-inbox");
        inboxCount.innerText = "0";
    }
}

function calculateClusters(visibleNodes, visibleLinks) {
    if (!visibleNodes || visibleNodes.length === 0) return 0;
    
    const getLinkId = (linkNode) => {
        return (linkNode && typeof linkNode === 'object') ? linkNode.id : linkNode;
    };
    
    const adj = {};
    visibleNodes.forEach(node => {
        adj[node.id] = [];
    });
    
    visibleLinks.forEach(link => {
        const u = getLinkId(link.source);
        const v = getLinkId(link.target);
        if (adj[u] && adj[v]) {
            adj[u].push(v);
            adj[v].push(u);
        }
    });
    
    const visited = new Set();
    let clustersCount = 0;
    
    function dfs(nodeId) {
        visited.add(nodeId);
        const neighbors = adj[nodeId] || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                dfs(neighbor);
            }
        }
    }
    
    visibleNodes.forEach(node => {
        if (!visited.has(node.id)) {
            clustersCount++;
            dfs(node.id);
        }
    });
    
    return clustersCount;
}

// --- D3 FORCE GRAPH ENGINE ---
function renderGraph() {
    const container = document.getElementById("graph-canvas");
    container.innerHTML = ""; // Clear
    
    // Filter nodes based on UI checklist
    const visibleNodes = graphData.nodes.filter(n => activeCategoryFilters.includes(n.category));
    const nodeIds = new Set(visibleNodes.map(n => n.id));
    
    // Filter links: only keep edges where both nodes are visible
    const visibleLinks = graphData.links.filter(l => {
        const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
        const targetId = typeof l.target === 'object' ? l.target.id : l.target;
        return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });

    // Update clusters count dynamically
    const clustersCount = calculateClusters(visibleNodes, visibleLinks);
    const statClustersEl = document.getElementById("stat-clusters");
    if (statClustersEl) {
        statClustersEl.innerText = clustersCount;
    }
    
    // Build connection count mapping for node sizing
    const degrees = {};
    visibleLinks.forEach(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        degrees[s] = (degrees[s] || 0) + 1;
        degrees[t] = (degrees[t] || 0) + 1;
    });
    
    // Hover highlights states
    let hoveredNode = null;
    const neighbors = new Set();
    
    const isMinimal = document.body.classList.contains("theme-minimal-dark");
    
    graphInstance = ForceGraph()(container)
        .graphData({ nodes: visibleNodes, links: visibleLinks })
        .backgroundColor(isMinimal ? "#0c0c0c" : "#09070f")
        .width(container.clientWidth)
        .height(container.clientHeight)
        .nodeCanvasObject((node, ctx, globalScale) => {
            const deg = degrees[node.id] || 0;
            const radius = 4 + Math.min(deg * 1.2, 12);
            
            // Draw Persistent Neon Ring if Selected or Active
            const isNoteActive = (activeNote && activeNote.title.toLowerCase() === node.title.toLowerCase());
            const isNodeSelected = (selectedGraphNode && (selectedGraphNode.id === node.id || selectedGraphNode.title === node.title));
            const isActive = isNoteActive || isNodeSelected;
                             
            const isMinimalTheme = document.body.classList.contains("theme-minimal-dark");
            
            const isHovered = hoveredNode && node.id === hoveredNode.id;
            const isNeighbor = hoveredNode && neighbors.has(node.id);
                             
            if (isActive) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI, false);
                ctx.strokeStyle = CATEGORY_COLORS[node.category] || "#bb9af7";
                ctx.lineWidth = 2.5 / globalScale;
                if (!isMinimalTheme) {
                    ctx.shadowColor = CATEGORY_COLORS[node.category] || "#bb9af7";
                    ctx.shadowBlur = 8;
                }
                ctx.stroke();
                
                // Reset shadow properties immediately
                ctx.shadowBlur = 0;
                ctx.shadowColor = "transparent";
            }
            
            // Draw Core Circle (Solid background)
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
            
            // If another node is hovered, dim non-neighbors
            if (hoveredNode) {
                if (!isHovered && !isNeighbor) {
                    ctx.fillStyle = isMinimalTheme ? "rgba(40, 40, 40, 0.15)" : "rgba(30, 25, 45, 0.15)";
                } else {
                    ctx.fillStyle = CATEGORY_COLORS[node.category] || "#ffffff";
                }
            } else {
                ctx.fillStyle = CATEGORY_COLORS[node.category] || "#ffffff";
            }
            ctx.fill();
            
            // Core outline
            ctx.strokeStyle = isMinimalTheme ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.15)";
            ctx.lineWidth = 1 / globalScale;
            ctx.stroke();
            
            // --- SELECTIVE LABEL RENDERING ---
            // Only render text if zoomed in (scale > 0.75), hovered, active, or a neighbor of hovered
            const shouldDrawLabel = isActive || isHovered || isNeighbor || (globalScale > 0.75);
            
            if (shouldDrawLabel) {
                const fontSize = 10;
                ctx.font = `${fontSize}px ${isMinimalTheme ? "'JetBrains Mono', monospace" : "'Inter', sans-serif"}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                
                const textY = node.y + radius + 5;
                const labelText = node.title;
                
                // 1. Draw Background Outline Halo (Obsidian Style)
                ctx.strokeStyle = isMinimalTheme ? "#0c0c0c" : "#09070f";
                ctx.lineWidth = 4;
                ctx.lineJoin = 'round';
                ctx.strokeText(labelText, node.x, textY);
                
                // 2. Draw Filled Text with State-based Coloring
                if (isActive) {
                    ctx.fillStyle = CATEGORY_COLORS[node.category] || "#bb9af7";
                } else if (isHovered) {
                    ctx.fillStyle = CATEGORY_COLORS[node.category] || "#ffffff";
                } else if (isNeighbor) {
                    ctx.fillStyle = isMinimalTheme ? "#e5e5e5" : "rgba(242, 237, 248, 0.95)";
                } else if (hoveredNode) {
                    // Zoomed in but dimmed (not connected to hovered node)
                    ctx.fillStyle = isMinimalTheme ? "rgba(229, 229, 229, 0.12)" : "rgba(242, 237, 248, 0.18)";
                } else {
                    // Standard zoomed-in label
                    ctx.fillStyle = isMinimalTheme ? "#a3a3a3" : "rgba(242, 237, 248, 0.75)";
                }
                
                ctx.fillText(labelText, node.x, textY);
            }
        })
        .nodePointerAreaPaint((node, color, ctx) => {
            // Define clickable pointer hit area matching the radius + label height
            const deg = degrees[node.id] || 0;
            const radius = 4 + Math.min(deg * 1.2, 12);
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI, false);
            ctx.fillStyle = color;
            ctx.fill();
        })
        .nodeLabel(node => `<div class="node-tooltip"><strong>${node.title}</strong><br/>Category: ${node.category}</div>`)
        .linkColor(link => {
            const activeNodeId = activeNote ? activeNote.title : (selectedGraphNode ? selectedGraphNode.id : null);
            const s = link.source.id || link.source;
            const t = link.target.id || link.target;
            
            if (hoveredNode) {
                if ((s === hoveredNode.id && neighbors.has(t)) || (t === hoveredNode.id && neighbors.has(s))) {
                    return "#ffffff"; // Highlight active connecting line
                }
                return "rgba(255, 255, 255, 0.02)"; // Dim rest
            } else if (activeNodeId) {
                if (s === activeNodeId || t === activeNodeId) {
                    const activeCat = activeNote ? activeNote.category : (selectedGraphNode ? selectedGraphNode.category : "ideas");
                    return CATEGORY_COLORS[activeCat] || "#ffffff";
                }
                return "rgba(255, 255, 255, 0.03)";
            }
            return "rgba(255, 255, 255, 0.08)";
        })
        .linkWidth(link => {
            const activeNodeId = activeNote ? activeNote.title : (selectedGraphNode ? selectedGraphNode.id : null);
            const s = link.source.id || link.source;
            const t = link.target.id || link.target;
            
            if (hoveredNode) {
                if ((s === hoveredNode.id) || (t === hoveredNode.id)) return 1.8;
            } else if (activeNodeId) {
                if (s === activeNodeId || t === activeNodeId) return 1.8;
            }
            return 1.0;
        })
        .onNodeClick((node, event) => {
            if (event) {
                event.stopPropagation();
            }
            
            let noteId = node.id;
            if (noteId && typeof noteId === 'object' && noteId.title) {
                noteId = noteId.title;
            } else if (noteId && typeof noteId !== 'string') {
                noteId = String(noteId);
            }
            
            // SINGLE CLICK: Center camera, select node, open note, and highlight in sidebar
            if (graphInstance) {
                graphInstance.centerAt(node.x, node.y, 800);
                graphInstance.zoom(2.2, 800);
            }
            
            selectedGraphNode = node;
            graphInstance.refresh();
            
            // Open note content
            let note = notes[noteId];
            if (!note && noteId) {
                note = Object.values(notes).find(n => n.title.toLowerCase() === noteId.toLowerCase());
            }
            
            if (note) {
                openNote(note);
            } else {
                console.warn("Mismatched node click registry:", noteId);
            }
            
            // Highlight in sidebar list (scroll into view, add active class)
            const noteTitle = node.title;
            document.querySelectorAll(".vault-categories li").forEach(li => {
                if (li.getAttribute("data-title") === noteTitle) {
                    li.classList.add("active");
                    li.scrollIntoView({ behavior: "smooth", block: "nearest" });
                } else {
                    li.classList.remove("active");
                }
            });
        })
        .onNodeHover(node => {
            container.style.cursor = node ? 'pointer' : 'default';
            if (node === hoveredNode) return;
            
            hoveredNode = node;
            neighbors.clear();
            
            if (node) {
                // Find visible neighbors of hovered node
                visibleLinks.forEach(l => {
                    const s = l.source.id || l.source;
                    const t = l.target.id || l.target;
                    if (s === node.id) neighbors.add(t);
                    if (t === node.id) neighbors.add(s);
                });
            }
            
            graphInstance.refresh(); // Redraw colors
        });
        
    // 1. Set link distance force
    graphInstance.d3Force('link')
        .distance(85)
        .iterations(2);

    // 2. Configure charge (repulsion force)
    graphInstance.d3Force('charge')
        .strength(-160)
        .distanceMax(400);

    // 3. Add custom collision force using local d3.min.js library (prevents node overlap)
    if (window.d3 && window.d3.forceCollide) {
        graphInstance.d3Force('collide', window.d3.forceCollide(node => {
            const deg = degrees[node.id] || 0;
            const radius = 4 + Math.min(deg * 1.2, 12);
            return radius + 16; // Collision bubble radius
        }).strength(0.8).iterations(2));
    }

    // 4. Configure centering force
    graphInstance.d3Force('center')
        .strength(0.15);

    // Stabilize layout and freeze physics to save CPU
    graphInstance.d3VelocityDecay(0.4); // Settles faster
    setTimeout(() => {
        if (graphInstance) graphInstance.cooldownTicks(60);
    }, 1000);
}

// Resize graph on layout container size changes (ResizeObserver)
const container = document.getElementById("graph-canvas");
if (container) {
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const { width, height } = entry.contentRect;
            if (graphInstance && width > 0 && height > 0) {
                // Instantly update force graph dimensions to match container exactly, preventing stretching
                graphInstance.width(width).height(height);
            }
        }
    });
    resizeObserver.observe(container);
}

// Update graph filtering checkboxes
function updateGraphFilters() {
    if (graphInstance) {
        renderGraph();
    }
}

// --- SEARCH & FILTER CLIENT SIDE ---
function filterNotes() {
    const items = document.querySelectorAll(".vault-categories li");
    let matchCount = 0;
    
    if (currentSearchQuery === "") {
        searchInfo.classList.add("hidden");
        items.forEach(li => {
            li.classList.remove("hidden");
        });
        return;
    }
    
    items.forEach(li => {
        const title = li.getAttribute("data-title").toLowerCase();
        const note = Object.values(notes).find(n => n.title.toLowerCase() === title);
        
        // Search matches note title, tags, or content summary
        const contentMatch = note ? note.summary.toLowerCase().includes(currentSearchQuery) : false;
        const tagMatch = note ? note.tags.some(t => t.toLowerCase().includes(currentSearchQuery)) : false;
        
        if (title.includes(currentSearchQuery) || contentMatch || tagMatch) {
            li.classList.remove("hidden");
            matchCount++;
        } else {
            li.classList.add("hidden");
        }
    });
    
    // Show match results bar
    searchInfo.classList.remove("hidden");
    searchCount.innerText = matchCount;
}

// --- NOTE VIEW & RENDER WORKSPACE ---
async function openNote(note) {
    activeNote = note;
    
    // Toggle active sidebar item
    document.querySelectorAll(".vault-categories li").forEach(li => {
        if (li.getAttribute("data-title") === note.title) {
            li.classList.add("active");
        } else {
            li.classList.remove("active");
        }
    });
    
    try {
        const res = await fetch(`/api/notes/${note.category}/${encodeURIComponent(note.filename)}`);
        if (res.status === 404) {
             alert("El archivo de la nota no existe en el disco.");
             return;
        }
        const fullNote = await res.json();
        
        // Swap to Viewer mode
        noteEditor.classList.remove("active");
        noteViewer.classList.add("active");
        
        // Populate Header info
        viewNoteBadge.innerText = note.category;
        viewNoteBadge.className = "note-category-badge " + note.category;
        viewNoteTitle.innerText = fullNote.title;
        viewNoteDates.innerText = `Creada: ${fullNote.created || "n/a"} • Actualizada: ${fullNote.updated || "n/a"}`;
        
        // Toggle Curation HUD for source files
        if (note.category === "sources" && fullNote.status === "unread") {
            curationHud.classList.remove("hidden");
            hudSourceType.innerText = fullNote.source_type || "MCP Ingest";
            if (fullNote.source_url) {
                hudSourceUrl.href = fullNote.source_url;
                hudSourceUrl.classList.remove("hidden");
            } else {
                hudSourceUrl.classList.add("hidden");
            }
        } else {
            curationHud.classList.add("hidden");
        }
        
        // Parse Markdown body safely (DOMPurify + wikilinks parse)
        viewNoteBody.innerHTML = renderMarkdown(fullNote.content);
        
        // Bind hover preview event listeners for wikilinks
        bindWikiLinkPreviews();
        
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
        
        // Render backlinks
        viewNoteBacklinks.innerHTML = "";
        const backlinkNotes = note.backlinks || [];
        if (backlinkNotes.length > 0) {
            backlinkNotes.forEach(title => {
                const li = document.createElement("li");
                li.innerText = title;
                li.addEventListener("click", () => {
                    const target = notes[title];
                    if (target) openNote(target);
                });
                viewNoteBacklinks.appendChild(li);
            });
        } else {
            const li = document.createElement("li");
            li.className = "empty-backlinks";
            li.innerText = "Ninguna nota enlaza aquí todavía.";
            viewNoteBacklinks.appendChild(li);
        }
        
        // Enable footer buttons
        editNoteBtn.disabled = false;
        deleteNoteBtn.disabled = false;
        
    } catch (e) {
        console.error("Error opening note:", e);
    }
}

// Convert markdown text to HTML, resolving custom wikilinks
function renderMarkdown(mdText) {
    if (!mdText) return "<p><i>Contenido vacío</i></p>";
    
    // Replace [[Note Name]] or [[Note Name|Alias]] with custom anchor elements
    let processed = mdText.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, alias) => {
        const noteName = target.trim();
        const display = alias ? alias.trim() : noteName;
        
        // Check if note exists in notes directory (case-insensitive)
        const exists = notes[noteName] || Object.keys(notes).some(k => k.toLowerCase() === noteName.toLowerCase());
        const className = exists ? 'wikilink' : 'wikilink broken';
        
        return `<a class="${className}" href="#" data-note="${noteName}">${display}</a>`;
    });
    
    const rawHtml = marked.parse(processed);
    return DOMPurify.sanitize(rawHtml);
}

// Open note click handler for custom wikilinks
function openNoteByName(name) {
    // Find note case-insensitively
    const match = Object.values(notes).find(n => n.title.toLowerCase() === name.toLowerCase());
    if (match) {
        openNote(match);
    } else {
        // Create broken link note instantly!
        if (confirm(`La nota "${name}" no existe. ¿Quieres crearla ahora?`)) {
            startNewNote(name);
        }
    }
}

// Bind hover and click events on rendered wikilinks
function bindWikiLinkPreviews() {
    const links = viewNoteBody.querySelectorAll(".wikilink");
    links.forEach(a => {
        const name = a.getAttribute("data-note");
        
        // Click listener
        a.addEventListener("click", (e) => {
            e.preventDefault();
            openNoteByName(name);
        });
        
        // Hover popover preview listener
        let hoverTimeout = null;
        let popoverEl = null;
        
        a.addEventListener("mouseenter", (e) => {
            hoverTimeout = setTimeout(() => {
                const targetNote = Object.values(notes).find(n => n.title.toLowerCase() === name.toLowerCase());
                
                // Build popover overlay
                popoverEl = document.createElement("div");
                popoverEl.className = "wikilink-popover glass";
                
                const rect = a.getBoundingClientRect();
                popoverEl.style.top = `${rect.bottom + window.scrollY + 6}px`;
                popoverEl.style.left = `${rect.left + window.scrollX}px`;
                
                if (targetNote) {
                    popoverEl.innerHTML = `
                        <div class="popover-header">
                            <span class="popover-title">${targetNote.title}</span>
                            <span class="note-category-badge ${targetNote.category}">${targetNote.category}</span>
                        </div>
                        <div class="popover-body">${targetNote.summary}</div>
                        <div class="popover-footer">
                            <span class="tag-pill">Conexiones: ${targetNote.links.length}</span>
                            <span class="tag-pill">Backlinks: ${targetNote.backlinks.length}</span>
                        </div>
                    `;
                } else {
                    popoverEl.innerHTML = `
                        <div class="popover-header">
                            <span class="popover-title" style="color:var(--color-errors)">No Creada</span>
                        </div>
                        <div class="popover-body">La nota "${name}" no existe todavía en tu cerebro. Haz clic para crearla.</div>
                    `;
                }
                
                document.body.appendChild(popoverEl);
                // Trigger transition animation
                setTimeout(() => popoverEl.classList.add("visible"), 20);
                
            }, 250); // delay before preview
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
            <p>Haz clic en cualquier nodo del grafo o selecciona una nota en la barra lateral para ver su contenido, conexiones de wiki-links y referencias entrantes.</p>
        </div>
    `;
    viewNoteTags.innerHTML = "";
    viewNoteBacklinks.innerHTML = '<li class="empty-backlinks">Ninguna nota enlaza aquí todavía.</li>';
    editNoteBtn.disabled = true;
    deleteNoteBtn.disabled = true;
    curationHud.classList.add("hidden");
}

// --- CURATION HUB HANDLER ---
async function handleCurationAction(action) {
    if (!activeNote || activeNote.category !== "sources") return;
    
    try {
        if (action === "read") {
            // Update status to read directly
            const updateData = {
                title: activeNote.title,
                content: viewNoteBody.innerText, // Needs raw contents
                tags: activeNote.tags,
                status: "read",
                source_type: activeNote.source_type || "",
                source_url: activeNote.source_url || ""
            };
            
            // Read raw contents first
            const rawRes = await fetch(`/api/notes/sources/${encodeURIComponent(activeNote.filename)}`);
            const rawNote = await rawRes.json();
            updateData.content = rawNote.content;
            
            await fetch(`/api/notes/sources/${encodeURIComponent(activeNote.filename)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updateData)
            });
            
            await loadData();
            
        } else if (action === "promote-idea" || action === "promote-skill") {
            const targetCat = action === "promote-idea" ? "ideas" : "skills";
            const rawRes = await fetch(`/api/notes/sources/${encodeURIComponent(activeNote.filename)}`);
            const rawNote = await rawRes.json();
            
            const payload = {
                title: activeNote.title,
                content: rawNote.content,
                category: targetCat,
                tags: activeNote.tags.filter(t => t !== "mcp-ingest")
            };
            
            const promoteRes = await fetch(`/api/notes/promote/sources/${encodeURIComponent(activeNote.filename)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            
            const result = await promoteRes.json();
            if (result.status === "success") {
                 // Open promoted note
                 activeNote = {
                     title: payload.title,
                     category: targetCat,
                     filename: activeNote.filename
                 };
            }
            await loadData();
        }
    } catch (e) {
        console.error("Curation action failed:", e);
    }
}

// --- NOTE EDITOR (CRUD) ---
function startNewNote(initialTitle = "") {
    // Switch panels
    noteViewer.classList.remove("active");
    noteEditor.classList.add("active");
    
    editNoteTitle.value = initialTitle;
    editNoteTitle.disabled = false;
    editNoteCategory.value = "ideas";
    editNoteCategory.disabled = false;
    editNoteTags.value = "";
    editNoteStatus.value = "";
    editNoteContent.value = "";
    editNoteStatus.classList.add("hidden");
    
    activeNote = null; // New note mode
}

function startEditingNote() {
    if (!activeNote) return;
    
    // Fetch raw content
    fetch(`/api/notes/${activeNote.category}/${encodeURIComponent(activeNote.filename)}`)
        .then(res => res.json())
        .then(fullNote => {
            noteViewer.classList.remove("active");
            noteEditor.classList.add("active");
            
            editNoteTitle.value = fullNote.title;
            // Lock category/title edits for daily journal logs to prevent broken file mapping
            if (activeNote.category === "journal") {
                 editNoteTitle.disabled = true;
                 editNoteCategory.disabled = true;
            } else {
                 editNoteTitle.disabled = false;
                 editNoteCategory.disabled = false;
            }
            
            editNoteCategory.value = activeNote.category;
            editNoteTags.value = fullNote.tags.join(", ");
            editNoteStatus.value = fullNote.status || "";
            editNoteContent.value = fullNote.content;
            
            if (activeNote.category === "errors") {
                editNoteStatus.classList.remove("hidden");
            } else {
                editNoteStatus.classList.add("hidden");
            }
        });
}

function cancelEditing() {
    noteEditor.classList.remove("active");
    noteViewer.classList.add("active");
    if (activeNote) {
        openNote(activeNote);
    } else {
        closeNoteView();
    }
}

async function handleSaveNote() {
    const title = editNoteTitle.value.trim();
    const category = editNoteCategory.value;
    const content = editNoteContent.value;
    const status = editNoteStatus.value;
    
    if (!title) {
        alert("El título de la nota no puede estar vacío.");
        return;
    }
    
    // Parse tags split by comma
    const tags = editNoteTags.value.split(",")
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);
        
    const filename = activeNote ? activeNote.filename : `${title}.md`;
    
    const payload = {
        title: title,
        content: content,
        tags: tags,
        status: status
    };
    
    try {
        const url = `/api/notes/${category}/${encodeURIComponent(filename)}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        if (res.status === 400) {
             const err = await res.json();
             alert(`Error: ${err.detail}`);
             return;
        }
        
        // Save state and reload
        activeNote = {
            title: title,
            category: category,
            filename: filename.endsWith(".md") ? filename : `${filename}.md`
        };
        
        await loadData();
        
    } catch (e) {
        console.error("Save note failed:", e);
    }
}

async function handleDeleteNote() {
    if (!activeNote) return;
    
    if (confirm(`¿Estás seguro de que quieres eliminar la nota "${activeNote.title}"? Esta acción no se puede deshacer.`)) {
        try {
            await fetch(`/api/notes/${activeNote.category}/${encodeURIComponent(activeNote.filename)}`, {
                method: "DELETE"
            });
            closeNoteView();
            await loadData();
        } catch (e) {
            console.error("Delete note failed:", e);
        }
    }
}

// Daily note: YYYY-MM-DD.md inside journal folder
async function openOrCreateDailyNote() {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const filename = `${today}.md`;
    const title = `Diario: ${today}`;
    
    // Check if it already exists
    const match = Object.values(notes).find(n => n.category === "journal" && n.title === title);
    if (match) {
        openNote(match);
        return;
    }
    
    // Create new daily note from template
    try {
        // Check if template exists
        const resTemplate = await fetch("/api/notes/templates/journal_entry.md").catch(() => null);
        let content = `# ${title}\n\n## Achievements Today\n- \n\n## Next Steps\n- `;
        if (resTemplate && resTemplate.status === 200) {
             const tempObj = await resTemplate.json();
             content = tempObj.content.replace(/YYYY-MM-DD/g, today);
        }
        
        const payload = {
            title: title,
            content: content,
            tags: ["journal", "daily"]
        };
        
        await fetch(`/api/notes/journal/${encodeURIComponent(filename)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        activeNote = {
            title: title,
            category: "journal",
            filename: filename
        };
        
        await loadData();
    } catch (e) {
        console.error("Error creating daily note:", e);
    }
}

// --- WIKILINK AUTOCOMPLETE DRAWER ---
function handleEditorInput(e) {
    const textarea = editNoteContent;
    const value = textarea.value;
    const selectionEnd = textarea.selectionEnd;
    
    // Find if user typed "[[" recently
    const textBeforeCursor = value.substring(0, selectionEnd);
    const lastOpenBracket = textBeforeCursor.lastIndexOf("[[");
    
    if (lastOpenBracket !== -1 && lastOpenBracket >= textBeforeCursor.lastIndexOf("]]")) {
        // Trigger drawer autocomplete
        autocompleteActive = true;
        autocompleteStartIndex = lastOpenBracket + 2;
        const query = textBeforeCursor.substring(autocompleteStartIndex).toLowerCase();
        
        showAutocompleteDrawer(query, textarea);
    } else {
        hideAutocompleteDrawer();
    }
}

function handleEditorKeyDown(e) {
    if (!autocompleteActive) return;
    
    const items = autocompleteDrawer.querySelectorAll(".autocomplete-item");
    if (items.length === 0) return;
    
    let selectedIdx = -1;
    items.forEach((item, idx) => {
        if (item.classList.contains("selected")) selectedIdx = idx;
    });
    
    if (e.key === "ArrowDown") {
        e.preventDefault();
        if (selectedIdx !== -1) items[selectedIdx].classList.remove("selected");
        const next = (selectedIdx + 1) % items.length;
        items[next].classList.add("selected");
        items[next].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (selectedIdx !== -1) items[selectedIdx].classList.remove("selected");
        const prev = (selectedIdx - 1 + items.length) % items.length;
        items[prev].classList.add("selected");
        items[prev].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIdx !== -1) {
            items[selectedIdx].click();
        } else {
            items[0].click();
        }
    } else if (e.key === "Escape") {
        e.preventDefault();
        hideAutocompleteDrawer();
    }
}

function showAutocompleteDrawer(query, textarea) {
    // Filter matching notes
    const allTitles = Object.keys(notes);
    const matches = allTitles.filter(t => t.toLowerCase().includes(query))
        .map(t => notes[t])
        .slice(0, 10); // Limit to 10 entries
        
    if (matches.length === 0) {
        hideAutocompleteDrawer();
        return;
    }
    
    autocompleteDrawer.innerHTML = "";
    matches.forEach((note, idx) => {
        const item = document.createElement("div");
        item.className = "autocomplete-item";
        if (idx === 0) item.classList.add("selected");
        
        const titleSpan = document.createElement("span");
        titleSpan.innerText = note.title;
        
        const catSpan = document.createElement("span");
        catSpan.className = `autocomplete-category ${note.category}`;
        catSpan.innerText = note.category.substring(0, 4);
        catSpan.style.backgroundColor = CATEGORY_COLORS[note.category];
        catSpan.style.color = "#09070f";
        
        item.appendChild(titleSpan);
        item.appendChild(catSpan);
        
        item.addEventListener("click", () => {
            const value = textarea.value;
            const selectionEnd = textarea.selectionEnd;
            
            const before = value.substring(0, autocompleteStartIndex);
            const after = value.substring(selectionEnd);
            
            // Replace [[query with [[Note Title]]
            textarea.value = before + note.title + "]]" + after;
            textarea.focus();
            
            // Reposition cursor after the closed brackets
            const newCursorPos = autocompleteStartIndex + note.title.length + 2;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
            
            hideAutocompleteDrawer();
        });
        
        autocompleteDrawer.appendChild(item);
    });
    
    // Reposition the drawer floating under the cursor coordinates
    // Approximate positioning based on character count (we can place it absolute under textarea)
    autocompleteDrawer.classList.remove("hidden");
    const caret = getCaretCoordinates(textarea, textarea.selectionEnd);
    
    autocompleteDrawer.style.top = `${Math.min(caret.top + 24, textarea.clientHeight - 120)}px`;
    autocompleteDrawer.style.left = `${Math.min(caret.left, textarea.clientWidth - 280)}px`;
}

function hideAutocompleteDrawer() {
    autocompleteActive = false;
    autocompleteStartIndex = -1;
    autocompleteDrawer.classList.add("hidden");
}

// Approximate caret coordinate calculator
function getCaretCoordinates(element, position) {
    const { offsetLeft, offsetTop } = element;
    // Basic approximate placement coordinates
    return {
        top: offsetTop + (element.value.substring(0, position).split('\n').length * 20),
        left: offsetLeft + 20
    };
}

// --- SETTINGS MODAL DIALOG ---
async function openSettings() {
    settingsModal.classList.add("active");
    settingTokenInput.value = "Obteniendo token...";
    
    try {
        // Fetch X-Ingest-Token from server. Since it's stored in .env, we fetch git status which has env data, or settings.
        // Actually, we can fetch git status which runs remote checkout checks. Let's create an endpoint or render the token.
        // Wait, main.py generates the token. Let's send a call to read the token.
        // Wait, main.py doesn't have an endpoint for the token? Ah, let's look:
        // We added token generation but forgot to add a GET /api/settings route?
        // Wait, in main.py we can access INGEST_TOKEN directly, but we didn't add an explicit endpoint.
        // Ah! But wait, we can just return it in the Git status or write a quick endpoint.
        // Actually, we can check main.py. Yes! We have:
        // We can expose the token securely, or since the backend only binds to 127.0.0.1 (localhost) and the user has full access, we can fetch it.
        // Let's modify main.py if needed, or did SetupAgent add it?
        // Wait! Let's check main.py endpoints. We have `GET /api/git/status`.
        // Let's check if we can add a token API or if we already have it.
        // Ah, in main.py there is no token endpoint, but we can easily add it! Or we can retrieve it by fetching `/api/git/status` if we include it.
        // Wait! Let's look at `main.py` lines.
        // We can add a simple GET /api/settings endpoint to get the INGEST_TOKEN!
        // Let's see: yes, that is extremely useful. Let's write the fetch logic in app.js and if the backend returns 404, we will add the endpoint to main.py.
        // Let's see if we can get the token.
        const res = await fetch("/api/git/status");
        const status = await res.json();
        
        // Wait, did we put token in git status? No, we didn't. Let's write a settings endpoint or get it.
        // Let's fetch /api/settings. We will add this route to main.py shortly!
        const resSettings = await fetch("/api/settings").catch(() => null);
        if (resSettings && resSettings.status === 200) {
             const settings = await resSettings.json();
             settingTokenInput.value = settings.ingest_token;
        } else {
             // Fallback: we will add the endpoint in main.py
             settingTokenInput.value = "INGEST_TOKEN (Recarga el servidor)";
        }
        
        renderGitStatusCard(status);
        
    } catch (e) {
        console.error("Settings load failed:", e);
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

// --- GIT SYNCHRONIZER PUSH/PULL ---
async function handleSync() {
    setSyncState("syncing");
    
    try {
        const res = await fetch("/api/git/sync", { method: "POST" });
        const result = await res.json();
        
        if (result.status === "success") {
            setSyncState("synced");
            showToast("success", result.message);
        } else if (result.status === "conflict") {
            setSyncState("conflict");
            alert(`Conflicto de Sincronización:\n\n${result.message}`);
            showToast("warning", "Conflicto resuelto con duplicados.");
        } else {
            setSyncState("pending"); // local changes or error state
            showToast("error", `Error de sinc: ${result.message}`);
        }
        
        // Reload index to fetch any new files pulled from remote
        await loadData();
        
    } catch (e) {
        setSyncState("pending");
        showToast("error", "Fallo de red al intentar sincronizar con GitHub.");
        console.error("Sync failed:", e);
    }
}

// Check git status to update header pill
async function checkGitStatus() {
    try {
        const res = await fetch("/api/git/status");
        const status = await res.json();
        
        if (status.has_local_changes) {
            setSyncState("pending");
        } else {
            setSyncState("synced");
        }
    } catch (e) {
        // Backend might be offline or starting up
        setSyncState("disconnected");
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
            syncText.innerText = "Conflicto Resuelto";
            break;
        case "disconnected":
        default:
            syncText.innerText = "Sin Conexión";
            break;
    }
}

// Global slide-in toasts
function showToast(type, message) {
    const toast = document.createElement("div");
    toast.className = `toast-notification glass ${type}`;
    
    // Accent colors based on toast type
    let color = "var(--color-ideas)";
    let title = "Notificación";
    if (type === "success") { color = "var(--color-success)"; title = "Éxito"; }
    if (type === "warning") { color = "var(--color-warning)"; title = "Advertencia"; }
    if (type === "error") { color = "var(--color-danger)"; title = "Error"; }
    
    toast.innerHTML = `
        <div style="border-left: 3px solid ${color}; padding-left: 10px;">
            <strong style="color:${color}; font-size:12px; text-transform:uppercase;">${title}</strong>
            <p style="font-size:12px; margin-top:2px; color:var(--text-primary);">${message}</p>
        </div>
    `;
    
    // Style toast overlay positions
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
    
    // Slide up
    setTimeout(() => {
        toast.style.transform = "translateY(0)";
        toast.style.opacity = "1";
    }, 20);
    
    // Fade out and remove
    setTimeout(() => {
        toast.style.transform = "translateY(20px)";
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 350);
    }, 4000);
}

// --- SCoA DEBATE STREAMING FUNCTIONS ---

async function startScoaDebate() {
    const proposal = scoaProposal.value.trim();
    const category = scoaCategory.value;

    if (!proposal) {
        alert("Por favor, ingresa una propuesta técnica para debatir.");
        return;
    }

    // Hide inputs, show progress
    scoaInputGroup.classList.add("hidden");
    scoaProgressContainer.classList.remove("hidden");
    scoaLiveStageTitle.textContent = "Conectando al Tribunal SCoA...";

    // Reset Judge Cards classes and status text
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

    // Default active tab to security reviewer on start
    selectScoaTab("security");

    // Initialize accumulated text object
    window.scoaStageTexts = { security: "", performance: "", uiux: "", moderator: "" };

    const url = `/api/debate/stream?proposal=${encodeURIComponent(proposal)}&category=${encodeURIComponent(category)}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            handleScoaEvent(data, category, eventSource);
        } catch (e) {
            console.error("Error al parsear JSON del evento:", e, event.data);
        }
    };

    eventSource.onerror = function(err) {
        console.error("Conexión del debate fallida:", err);
        scoaLiveStageTitle.textContent = "Error de conexión";
        showToast("error", "Se perdió el stream o falló la conexión con el tribunal.");
        eventSource.close();
    };
}

function handleScoaEvent(event, category, eventSource) {
    if (event.error) {
        scoaLiveStageTitle.textContent = "Error en el debate";
        showToast("error", `Error: ${event.error}`);
        if (eventSource) eventSource.close();
        return;
    }

    const stage = event.stage;

    if (event.status === "start") {
        updateJudgeUI(stage, "active");
        
        // Auto-switch tab to current deliberating judge
        selectScoaTab(stage);

        let titleText = "";
        switch (stage) {
            case "security":
                titleText = "Revisando Seguridad...";
                break;
            case "performance":
                titleText = "Revisando Rendimiento...";
                break;
            case "uiux":
                titleText = "Revisando Interfaz (UI/UX)...";
                break;
            case "moderator":
                titleText = "Sintetizando Resultados del Tribunal...";
                break;
        }

        scoaLiveStageTitle.textContent = titleText;
    } else if (event.chunk) {
        if (!window.scoaStageTexts) {
            window.scoaStageTexts = { security: "", performance: "", uiux: "", moderator: "" };
        }
        window.scoaStageTexts[stage] = (window.scoaStageTexts[stage] || "") + event.chunk;
        
        const outputDiv = document.getElementById(`scoa-output-${stage}`);
        if (outputDiv) {
            outputDiv.innerHTML = renderMarkdown(window.scoaStageTexts[stage]);
        }
        
        if (scoaDebateRecord) {
            scoaDebateRecord.scrollTop = scoaDebateRecord.scrollHeight;
        }
    } else if (event.status === "done") {
        updateJudgeUI(stage, "done");
    } else if (stage === "file_write" && event.status === "saved") {
        if (eventSource) eventSource.close();
        scoaLiveStageTitle.textContent = "Debate Finalizado y Guardado";
        showToast("success", `Debate guardado con éxito como nota: ${event.filename}`);
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
        if (info.card) {
            info.card.className = `judge-card active ${info.suffix}-active`;
        }
        if (info.status) {
            info.status.textContent = "Deliberating...";
        }
    } else if (state === "done") {
        if (info.card) {
            info.card.className = `judge-card done ${info.suffix}-done`;
        }
        if (info.status) {
            info.status.textContent = "Done";
        }
    }
}

async function finalizeDebate(filename, category) {
    // 1. Reload the database index (rebuild index and load notes/graph)
    await loadData();

    // 2. Find the note in our notes registry
    const match = Object.values(notes).find(n =>
        n.category === category &&
        n.filename.toLowerCase() === filename.toLowerCase()
    );

    if (match) {
        // Open the note details view in the sidebar/inspector
        openNote(match);
        showToast("success", `Debate guardado y abierto: ${match.title}`);

        // Close modal automatically after a short delay so the user can see the final state
        setTimeout(() => {
            scoaModal.classList.remove("active");
        }, 2000);
    } else {
        console.warn(`No se pudo encontrar la nota del debate recién guardada: ${filename} en la categoría: ${category}`);
        showToast("warning", "El debate finalizó, pero no se pudo abrir la nota automáticamente.");
    }
}

// --- SCOA DEBATE TAB SWITCHER ---
function selectScoaTab(stage) {
    const stages = ["security", "performance", "uiux", "moderator"];
    stages.forEach(s => {
        const el = document.getElementById(`scoa-stage-${s}`);
        const card = document.getElementById(`judge-${s}`);
        
        if (el) {
            if (s === stage) {
                el.classList.remove("hidden");
            } else {
                el.classList.add("hidden");
            }
        }
        
        if (card) {
            if (s === stage) {
                card.classList.add("selected-tab");
            } else {
                card.classList.remove("selected-tab");
            }
        }
    });
}

// --- THEME MANAGEMENT SYSTEM ---
function initTheme() {
    const savedTheme = localStorage.getItem("app-theme") || "cyber-noir";
    if (savedTheme === "minimal-dark") {
        document.body.classList.add("theme-minimal-dark");
        if (graphInstance) {
            graphInstance.backgroundColor("#0c0c0c");
        }
    } else {
        document.body.classList.remove("theme-minimal-dark");
        if (graphInstance) {
            graphInstance.backgroundColor("#09070f");
        }
    }
}

function toggleTheme() {
    const isMinimal = document.body.classList.contains("theme-minimal-dark");
    if (isMinimal) {
        document.body.classList.remove("theme-minimal-dark");
        localStorage.setItem("app-theme", "cyber-noir");
        if (graphInstance) {
            graphInstance.backgroundColor("#09070f");
            graphInstance.refresh();
        }
    } else {
        document.body.classList.add("theme-minimal-dark");
        localStorage.setItem("app-theme", "minimal-dark");
        if (graphInstance) {
            graphInstance.backgroundColor("#0c0c0c");
            graphInstance.refresh();
        }
    }
}

