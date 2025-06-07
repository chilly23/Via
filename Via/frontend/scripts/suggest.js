//------------------------Input Suggestions------------------------
function fetchSuggestions(query, callback) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

    fetch(url)
        .then(response => response.json())
        .then(data => callback(data))
        .catch(error => console.error("Error fetching suggestions:", error));
}

function getRecentSearches() {
    const recentSearches = localStorage.getItem('recentSearches');
    return recentSearches ? JSON.parse(recentSearches) : { source: [], destination: [] };
}

function saveSearch(type, query) {
    const recentSearches = getRecentSearches();

    // Limit to the 5 most recent searches
    if (!recentSearches[type].includes(query)) {
        recentSearches[type].unshift(query);
        recentSearches[type] = recentSearches[type].slice(0, 5);
    }

    localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
}

function showSuggestions(elementId, suggestions) {
    const suggestionsContainer = document.getElementById(elementId);
    suggestionsContainer.innerHTML = '';

    suggestions.forEach(suggestion => {
        const suggestionItem = document.createElement('div');
        suggestionItem.classList.add('suggestion-item');

        const icon = document.createElement('img');
        icon.src = 'https://img.icons8.com/ios-filled/50/000000/marker.png';
        icon.classList.add('suggestion-icon');

        const text = document.createElement('div');
        text.classList.add('suggestion-text');

        // For API suggestions, limit to the first 3 elements in display_name
        const shortName = typeof suggestion === 'string' 
            ? suggestion 
            : suggestion.display_name.split(', ').slice(0, 3).join(', ');
        text.innerText = shortName;

        suggestionItem.appendChild(icon);
        suggestionItem.appendChild(text);

        suggestionItem.addEventListener('click', () => {
            document.getElementById(elementId.replace('-suggestions', '')).value = shortName;
            saveSearch(elementId.replace('-suggestions', ''), shortName);
            suggestionsContainer.style.display = "none";
        });

        suggestionsContainer.appendChild(suggestionItem);
    });

    suggestionsContainer.style.display = suggestions.length > 0 ? "block" : "none";
}

function handleInput(inputId, suggestionsId, type) {
    const query = document.getElementById(inputId).value;

    if (query.length > 0) {
        fetchSuggestions(query, suggestions => showSuggestions(suggestionsId, suggestions));
    } else {
        document.getElementById(suggestionsId).style.display = "none";
    }
}

function showRecentSearches(inputId, suggestionsId, type) {
    const recentSearches = getRecentSearches()[type];
    showSuggestions(suggestionsId, recentSearches);
}

document.getElementById('source').addEventListener('input', () => {
    handleInput('source', 'source-suggestions', 'source');
});

document.getElementById('destination').addEventListener('input', () => {
    handleInput('destination', 'destination-suggestions', 'destination');
});

document.getElementById('source').addEventListener('focus', () => {
    if (document.getElementById('source').value.trim() === '') {
        showRecentSearches('source', 'source-suggestions', 'source');
    }
});

document.getElementById('destination').addEventListener('focus', () => {
    if (document.getElementById('destination').value.trim() === '') {
        showRecentSearches('destination', 'destination-suggestions', 'destination');
    }
});

//----------------------Hide Suggestions While Not Clicking----------------------
const searchInput1 = document.getElementById("source");
const searchInput2 = document.getElementById("destination");

const suggestions1 = document.getElementById("source-suggestions");
const suggestions2 = document.getElementById("destination-suggestions");

document.addEventListener("click", (event) => {
    if (!searchInput1.contains(event.target) && !suggestions1.contains(event.target)) {
        suggestions1.style.display = "none";
    }
    if (!searchInput2.contains(event.target) && !suggestions2.contains(event.target)) {
        suggestions2.style.display = "none";
    }
});
