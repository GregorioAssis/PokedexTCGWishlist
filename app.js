const pokedexContainer = document.getElementById('pokedex');
let ITEMS_PER_PAGE = 50; 
let cacheTCG = {}; 

// Complete logic configuration for all 9 generations (PokeAPI offset and limits)
const regionsConfig = {
    all:    { offsetStart: 0,   totalItems: 1025 },
    kanto:  { offsetStart: 0,   totalItems: 151 },
    johto:  { offsetStart: 151, totalItems: 100 },
    hoenn:  { offsetStart: 251, totalItems: 135 },
    sinnoh: { offsetStart: 386, totalItems: 107 },
    unova:  { offsetStart: 493, totalItems: 156 },
    kalos:  { offsetStart: 649, totalItems: 72 },
    alola:  { offsetStart: 721, totalItems: 88 },
    galar:  { offsetStart: 809, totalItems: 96 },
    paldea: { offsetStart: 905, totalItems: 120 }
};

let currentRegion = 'all';
let currentRelativeOffset = 0; 

// Currency Formatters
const formatUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const formatBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Local Storage Management
const getWishlist = () => JSON.parse(localStorage.getItem('tcgWishlist')) || {};
const saveToWishlist = (id, data) => {
    const wishlist = getWishlist();
    wishlist[id] = data;
    localStorage.setItem('tcgWishlist', JSON.stringify(wishlist));
};
const removeFromWishlist = (id) => {
    const wishlist = getWishlist();
    delete wishlist[id];
    localStorage.setItem('tcgWishlist', JSON.stringify(wishlist));
};

// Clear entire wishlist logic
function clearWishlist() {
    const wishlist = getWishlist();
    if (Object.keys(wishlist).length === 0) {
        alert("Your wishlist is already empty.");
        return;
    }
    
    // Confirmation prompt to avoid accidental deletes
    if (confirm("Are you sure you want to remove all cards from your wishlist?")) {
        localStorage.removeItem('tcgWishlist');
        loadPage(); // Re-render the current page to clear visuals
    }
}

function initPokedex() { loadPage(); }

function changeFilter() { 
    cacheTCG = {}; // Clears cache to force API to fetch new rarity filters
}

function changeRegion(regionKey) {
    currentRegion = regionKey;
    currentRelativeOffset = 0; 
    loadPage();
}

function changeItemsPerPage(value) {
    ITEMS_PER_PAGE = parseInt(value);
    currentRelativeOffset = 0;
    loadPage();
}

function jumpToPage(offsetValue) {
    currentRelativeOffset = parseInt(offsetValue);
    loadPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadPage() {
    pokedexContainer.innerHTML = '';
    
    const regionObj = regionsConfig[currentRegion];
    const limit = Math.min(ITEMS_PER_PAGE, regionObj.totalItems - currentRelativeOffset);
    const actualApiOffset = regionObj.offsetStart + currentRelativeOffset;
    
    try {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${limit}&offset=${actualApiOffset}`);
        const data = await response.json();
        
        data.results.forEach((poke, index) => {
            const id = actualApiOffset + index + 1;
            renderPokemonSlot(poke.name, id);
        });

        updatePaginationUI();
    } catch (error) {
        console.error("PokeAPI Error:", error);
    }
}

function changePage(direction) {
    currentRelativeOffset += direction * ITEMS_PER_PAGE;
    loadPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updatePaginationUI() {
    const regionObj = regionsConfig[currentRegion];
    
    document.getElementById('btn-prev').disabled = currentRelativeOffset === 0;
    document.getElementById('btn-next').disabled = (currentRelativeOffset + ITEMS_PER_PAGE) >= regionObj.totalItems;
    
    const totalPages = Math.ceil(regionObj.totalItems / ITEMS_PER_PAGE);
    const currentPage = Math.floor(currentRelativeOffset / ITEMS_PER_PAGE) + 1;
    
    const pageJumpSelect = document.getElementById('page-jump');
    pageJumpSelect.innerHTML = ''; 
    
    for (let i = 1; i <= totalPages; i++) {
        const optionOffset = (i - 1) * ITEMS_PER_PAGE;
        const option = document.createElement('option');
        option.value = optionOffset;
        option.textContent = `Page ${i} of ${totalPages}`;
        if (i === currentPage) option.selected = true;
        pageJumpSelect.appendChild(option);
    }
}

function renderPokemonSlot(name, id) {
    const card = document.createElement('div');
    card.className = 'pokemon-card';
    card.id = `pokemon-${id}`;
    card.setAttribute('data-cy', `pokemon-card-${id}`);

    const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
    
    card.innerHTML = `
        <button class="remove-btn" data-cy="remove-btn-${id}" onclick="removeSelection(${id}, event)">✕</button>
        <div class="header">
            <span class="number">#${String(id).padStart(3, '0')}</span>
            <h3 class="name" data-cy="pokemon-name-${id}">${name}</h3>
        </div>
        <img class="pokemon-img" id="img-${id}" data-cy="pokemon-img-${id}" src="${spriteUrl}" alt="${name}">
        
        <div class="selected-info" id="info-${id}" data-cy="selected-info-${id}"></div>
        
        <div class="tcg-popup" id="popup-${id}" data-cy="tcg-popup-${id}">
            <span style="color: #a1a1aa; font-size: 0.85rem;">Fetching arts...</span>
        </div>
    `;

    pokedexContainer.appendChild(card);

    // Reapply saved card state if it exists in local storage
    const savedCard = getWishlist()[id];
    if (savedCard) { applyTCGCardUI(id, savedCard); }

    let hoverTimeout;
    card.addEventListener('mouseenter', () => {
        if (card.classList.contains('has-selection')) return;
        // Debounce to prevent Rate Limit on fast hovers
        hoverTimeout = setTimeout(() => fetchAndRenderTCG(id), 400);
    });

    card.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimeout);
    });
}

async function fetchAndRenderTCG(id) {
    const popup = document.getElementById(`popup-${id}`);
    
    if (cacheTCG[id] === 'loading') return;
    if (Array.isArray(cacheTCG[id])) {
        renderCardsInPopup(id, cacheTCG[id]);
        return;
    }

    const activeCheckboxes = document.querySelectorAll('.rarity-cb:checked');
    
    if (activeCheckboxes.length === 0) {
        popup.innerHTML = '<span style="color: #ef4444; font-size: 0.85rem;">Select at least one rarity filter at the top.</span>';
        return;
    }

    // 🟢 Injected: Animated Loading Icon
    popup.innerHTML = `
        <div class="loading-container">
            <span class="loader"></span>
            <span style="color: #a1a1aa; font-size: 0.85rem;">Fetching arts...</span>
        </div>
    `;

    cacheTCG[id] = 'loading';
    
    const queryParts = Array.from(activeCheckboxes)
        .map(cb => cb.value)
        .filter(val => val !== "");

    const rarityFilter = `(${queryParts.join(' OR ')})`;
    const queryPath = encodeURIComponent(`nationalPokedexNumbers:${id} ${rarityFilter}`);
    const apiUrl = `https://api.pokemontcg.io/v2/cards?q=${queryPath}`;

    try {
        const response = await fetch(apiUrl);
        const json = await response.json();
        
        if (!json.data || json.data.length === 0) {
            popup.innerHTML = '<span style="color: #a1a1aa; font-size: 0.85rem;">No cards found with these filters.</span>';
            delete cacheTCG[id]; 
            return;
        }

        const cardsToDisplay = json.data.slice(0, 60);
        cacheTCG[id] = cardsToDisplay;
        renderCardsInPopup(id, cardsToDisplay);

    } catch (error) {
        console.error("TCG API Error:", error);
        popup.innerHTML = '<span style="color: #ef4444; font-size: 0.85rem;">Failed to load cards.</span>';
        delete cacheTCG[id]; 
    }
}

function renderCardsInPopup(id, cardsData) {
    const popup = document.getElementById(`popup-${id}`);
    popup.innerHTML = ''; 

    cardsData.forEach(cardData => {
        const img = document.createElement('img');
        img.src = cardData.images.small;
        img.className = 'tcg-card-img';
        img.loading = "lazy";
        img.setAttribute('data-cy', `tcg-card-${id}-${cardData.id}`);
        
        const priceData = cardData.tcgplayer?.prices;
        const firstType = priceData ? Object.keys(priceData)[0] : null;
        const lowPrice = firstType && priceData[firstType].low ? priceData[firstType].low : null;

        img.onclick = (e) => {
            e.stopPropagation();
            
            const setTotal = cardData.set && cardData.set.printedTotal ? cardData.set.printedTotal : '∞';
            
            // Monta a string de busca exata que a Liga aceita: "Nome (Numero/Total)"
            let stringDeBusca = '';
            if (setTotal !== '∞') {
                stringDeBusca = `${cardData.name} (${cardData.number}/${setTotal})`;
            } else {
                stringDeBusca = `${cardData.name} ${cardData.number}`;
            }

            // O encodeURIComponent vai transformar os espaços em %20, parênteses em %28/%29 e barra em %2F
            const urlLiga = `https://www.ligapokemon.com.br/?view=cards/search&tipo=1&card=${encodeURIComponent(stringDeBusca)}`;

            const parsedData = {
                image: cardData.images.small,
                set: cardData.set ? cardData.set.name : 'N/A',
                cardName: cardData.name, 
                cardNumber: cardData.number,
                setTotal: setTotal,
                priceLowRaw: lowPrice,
                priceLow: lowPrice ? formatUSD.format(lowPrice) : 'N/A',
                ligaUrl: urlLiga
            };
            
            applyTCGCardUI(id, parsedData);
            saveToWishlist(id, parsedData);
        };
        
        popup.appendChild(img);
    });
}

function applyTCGCardUI(id, data) {
    const cardEl = document.getElementById(`pokemon-${id}`);
    const imgEl = document.getElementById(`img-${id}`);
    const infoEl = document.getElementById(`info-${id}`);

    cardEl.classList.add('has-selection');
    imgEl.src = data.image;
    imgEl.classList.add('tcg-selected');

    // Fallback de URL caso a carta já estivesse salva no LocalStorage em uma versão anterior
    const urlDaLiga = data.ligaUrl || `https://www.ligapokemon.com.br/?view=cards/search&card=${encodeURIComponent(data.cardName)}`;

    infoEl.innerHTML = `
        <p><strong>${data.cardName}</strong> (${data.cardNumber}/${data.setTotal})</p>
        <p><strong>Set:</strong> ${data.set}</p>
        <p><strong>Min US:</strong> <span class="price-tag">${data.priceLow || 'N/A'}</span></p>
        <a href="${urlDaLiga}" target="_blank" class="liga-link">🔗 Ver na Liga Pokémon</a>
    `;
}

function removeSelection(id, event) {
    event.stopPropagation(); 
    const cardEl = document.getElementById(`pokemon-${id}`);
    const imgEl = document.getElementById(`img-${id}`);

    cardEl.classList.remove('has-selection');
    imgEl.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
    imgEl.classList.remove('tcg-selected');
    
    removeFromWishlist(id);
}

// Robust function using Canvas + CORS to generate clean Base64 avoiding Cache issues
async function getBase64ImageFromUrl(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous'; 
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            // White background to prevent transparent PNGs turning black in PDF
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            
            resolve(canvas.toDataURL('image/jpeg', 0.8)); 
        };
        
        img.onerror = () => {
            console.warn("Failed to load image for PDF:", imageUrl);
            resolve(null); 
        };
        
        // Cache Buster: Forces browser to fetch a fresh CORS-compliant image
        img.src = imageUrl + '?not-from-cache=' + new Date().getTime();
    });
}

// Substitua apenas a função exportToPDF no seu app.js

async function exportToPDF() {
    const wishlist = getWishlist();
    const keys = Object.keys(wishlist).sort((a, b) => parseInt(a) - parseInt(b));

    if (keys.length === 0) {
        alert("Sua wishlist está vazia.");
        return;
    }

    const btnExport = document.querySelector('.export-btn');
    const originalText = btnExport.innerHTML;
    btnExport.innerHTML = "⏳ Gerando...";
    btnExport.disabled = true;

    // Cores do site para o PDF
    const colors = {
        primary: [11, 22, 44],    // Deep Navy
        highlight: [56, 189, 248], // Sky Blue
        text: [30, 41, 59],       // Dark Slate
        rowEven: [248, 250, 252],
        rowOdd: [255, 255, 255]
    };

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Cabeçalho
    doc.setFillColor(11, 14, 20); // Cor de fundo do site
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text("Pokédex TCG Wishlist", 14, 25);
    
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(`Exportado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 33);

    const tableData = [];
    const imagesCache = [];

    for (const key of keys) {
        const item = wishlist[key];
        const base64Img = await getBase64ImageFromUrl(item.image);
        imagesCache.push(base64Img); 

        tableData.push({
            dex: `#${String(key).padStart(3, '0')}`,
            img: "", 
            name: `${item.cardName}\n(${item.cardNumber}/${item.setTotal})`,
            set: item.set,
            price: item.priceLow || 'N/A'
        });
    }

    doc.autoTable({
        startY: 45,
        columns: [
            { header: 'ID', dataKey: 'dex' },
            { header: 'Card', dataKey: 'img' },
            { header: 'Nome da Carta (Link)', dataKey: 'name' },
            { header: 'Coleção', dataKey: 'set' },
            { header: 'Valor Min.', dataKey: 'price' }
        ],
        body: tableData,
        theme: 'grid',
        headStyles: { 
            fillColor: [21, 28, 44], 
            textColor: 255, 
            fontSize: 10, 
            halign: 'center',
            cellPadding: 5
        },
        styles: { 
            valign: 'middle', 
            fontSize: 9,
            cellPadding: 4,
            lineColor: [226, 232, 240]
        },
        columnStyles: {
            dex: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
            img: { cellWidth: 25 },
            name: { textColor: [37, 99, 235], fontStyle: 'bold' }, // Estilo de link (azul)
            price: { halign: 'right', textColor: [22, 163, 74], fontStyle: 'bold' }
        },
        didDrawCell: function(data) {
            // Desenha a imagem da carta
            if (data.column.dataKey === 'img' && data.cell.section === 'body') {
                const imgData = imagesCache[data.row.index];
                if (imgData) {
                    doc.addImage(imgData, 'JPEG', data.cell.x + 5, data.cell.y + 2, 15, 21);
                }
            }

            // Injeta o Hyperlink na célula do Nome
            if (data.column.dataKey === 'name' && data.cell.section === 'body') {
                const itemKey = keys[data.row.index];
                const item = wishlist[itemKey];
                if (item.ligaUrl) {
                    doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: item.ligaUrl });
                }
            }
        }
    });

    // Rodapé com Total
    const finalY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    
    // Cálculo do total (simplificado para o exemplo)
    let totalUSD = 0;
    keys.forEach(k => { if(wishlist[k].priceLowRaw) totalUSD += wishlist[k].priceLowRaw; });
    
    doc.text(`Total Estimado: ${formatUSD.format(totalUSD)}`, 14, finalY);

    doc.save("minha-pokedex-tcg.pdf");

    btnExport.innerHTML = originalText;
    btnExport.disabled = false;
}

initPokedex();
