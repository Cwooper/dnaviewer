// Global variables
let searchTimeout = null;
const SEARCH_DELAY = 300; // ms delay for live search
const HEARTBEAT_INTERVAL = 10000; // 10 seconds between heartbeats
let heartbeatTimer = null;
let clientID = null;

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    console.log('DNA Viewer initialized');

    // Generate a unique client ID
    clientID = generateClientID();

    // Initialize the status badge
    document.getElementById('fileStatus').textContent = 'No File Loaded';

    // Set up event listeners
    setupEventListeners();
    setupDragAndDrop();

    // Start sending heartbeats
    startHeartbeat();

    setupInstructionHandlers();
    const bootstrapScript = document.createElement('script');
    bootstrapScript.src = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js';
    document.body.appendChild(bootstrapScript);

    // Set up beforeunload event to notify server when closing
    window.addEventListener('beforeunload', function () {
        // Send a final notification to the server when the page is being closed
        navigator.sendBeacon('/api/shutdown', JSON.stringify({ clientId: clientID }));

        // Stop the heartbeat timer
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
        }
    });
}

// Instructions handling
function setupInstructionHandlers() {
    // For the collapsible banner
    const expandButton = document.getElementById('expandInstructions');
    const instructionsContent = document.getElementById('instructionsContent');
    const closeButton = document.getElementById('closeInstructionsBanner');
    const instructionsBanner = document.getElementById('instructionsBanner');

    // For the modal
    const helpButton = document.getElementById('helpButton');
    const instructionsModal = new bootstrap.Modal(document.getElementById('instructionsModal'));

    // Set up event listeners for banner
    if (expandButton) {
        expandButton.addEventListener('click', function () {
            instructionsContent.classList.toggle('d-none');
            expandButton.textContent = instructionsContent.classList.contains('d-none')
                ? 'Show Instructions'
                : 'Hide Instructions';
        });
    }

    if (closeButton) {
        closeButton.addEventListener('click', function () {
            instructionsBanner.classList.add('d-none');
            // Save in local storage that the user closed the banner
            localStorage.setItem('instructionsBannerClosed', 'true');
        });
    }

    // Check if we should show the banner (not if user closed it before)
    if (localStorage.getItem('instructionsBannerClosed') === 'true') {
        instructionsBanner.classList.add('d-none');
    }

    // Set up event listener for help button
    if (helpButton) {
        helpButton.addEventListener('click', function () {
            instructionsModal.show();
        });
    }
}

// Generate a unique client ID
function generateClientID() {
    return 'client_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// Start sending heartbeats to the server
function startHeartbeat() {
    // Send an initial heartbeat
    sendHeartbeat();

    // Set up interval for regular heartbeats
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}

// Send a heartbeat to the server
function sendHeartbeat() {
    fetch('/api/heartbeat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ clientId: clientID })
    }).catch(error => {
        console.error('Error sending heartbeat:', error);
    });
}

// Setup event listeners for the UI
function setupEventListeners() {
    // File upload handler
    document.getElementById('dnaFile').addEventListener('change', handleFileUpload);

    // Search button handler
    document.getElementById('searchButton').addEventListener('click', handleSearch);

    // Batch search button handler
    document.getElementById('batchSearchButton').addEventListener('click', handleBatchSearch);

    // Live search as user types
    document.getElementById('rsidSearch').addEventListener('input', handleLiveSearch);

    // Enable pressing Enter in search field
    document.getElementById('rsidSearch').addEventListener('keyup', function (event) {
        if (event.key === 'Enter') {
            handleSearch();
        }
    });

    // Clear results button
    document.getElementById('clearResults').addEventListener('click', clearResults);

    // Hide suggestions when clicking outside
    document.addEventListener('click', function (event) {
        if (!event.target.closest('.search-container')) {
            document.getElementById('suggestionsList').classList.add('d-none');
        }
    });
}

// Setup drag and drop functionality
function setupDragAndDrop() {
    const dropArea = document.querySelector('.custom-file-upload');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropArea.classList.add('border-primary');
    }

    function unhighlight() {
        dropArea.classList.remove('border-primary');
    }

    dropArea.addEventListener('drop', function (e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length) {
            document.getElementById('dnaFile').files = files;
            handleFileUpload();
        }
    });
}

// Handle real-time search as user types
function handleLiveSearch() {
    const searchInput = document.getElementById('rsidSearch');
    const query = searchInput.value.trim();
    const suggestionsList = document.getElementById('suggestionsList');

    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // Clear suggestions if input is empty
    if (!query) {
        suggestionsList.classList.add('d-none');
        return;
    }

    // Set a timeout to avoid making too many requests
    searchTimeout = setTimeout(() => {
        // Add "rs" prefix if not present for the search
        let searchQuery = query;
        if (!searchQuery.toLowerCase().startsWith('rs')) {
            searchQuery = 'rs' + searchQuery;
        }

        fetch(`/api/search?rsid=${encodeURIComponent(searchQuery)}&partial=true`)
            .then(response => response.json())
            .then(result => {
                if (result.success && result.partial && result.matches && result.matches.length > 0) {
                    // Display suggestions
                    displaySuggestions(result.matches);
                } else {
                    suggestionsList.classList.add('d-none');
                }
            })
            .catch(error => {
                console.error('Error fetching suggestions:', error);
                suggestionsList.classList.add('d-none');
            });
    }, SEARCH_DELAY);
}

// Display search suggestions - fixed version
function displaySuggestions(matches) {
    const suggestionsList = document.getElementById('suggestionsList');
    const searchInput = document.getElementById('rsidSearch');

    // Position it correctly relative to the viewport if needed
    const inputRect = searchInput.getBoundingClientRect();

    // Clear previous suggestions
    suggestionsList.innerHTML = '';

    // Ensure the dropdown is visible and positioned correctly
    suggestionsList.style.width = inputRect.width + "px";
    suggestionsList.style.position = "absolute";

    // Remove any existing classes that might affect positioning
    suggestionsList.classList.remove('d-none');

    // Force display
    suggestionsList.style.display = "block";
    suggestionsList.style.zIndex = "9999";

    // Ensure the parent has position relative for correct absolute positioning
    document.querySelector('.search-container').style.position = "relative";

    // Add new suggestions
    matches.forEach(match => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = match;
        item.addEventListener('click', () => {
            document.getElementById('rsidSearch').value = match.replace(/^rs/i, '');
            suggestionsList.style.display = "none";
            handleSearch();
        });
        suggestionsList.appendChild(item);
    });
}

// Handle live search and suggestions
function handleLiveSearch() {
    const searchInput = document.getElementById('rsidSearch');
    const query = searchInput.value.trim();
    const suggestionsList = document.getElementById('suggestionsList');

    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // Clear suggestions if input is empty
    if (!query) {
        suggestionsList.style.display = "none";
        return;
    }

    // Set a timeout to avoid making too many requests
    searchTimeout = setTimeout(() => {
        // Add "rs" prefix if not present for the search
        let searchQuery = query;
        if (!searchQuery.toLowerCase().startsWith('rs')) {
            searchQuery = 'rs' + searchQuery;
        }

        fetch(`/api/search?rsid=${encodeURIComponent(searchQuery)}&partial=true`)
            .then(response => response.json())
            .then(result => {
                if (result.success && result.partial && result.matches && result.matches.length > 0) {
                    // Display suggestions
                    displaySuggestions(result.matches);
                } else {
                    suggestionsList.style.display = "none";
                }
            })
            .catch(error => {
                console.error('Error fetching suggestions:', error);
                suggestionsList.style.display = "none";
            });
    }, SEARCH_DELAY);
}

// Handle DNA file upload
function handleFileUpload(event) {
    const fileInput = document.getElementById('dnaFile');
    const file = fileInput.files[0];
    if (!file) return;

    // Check if it's a text file
    if (!file.name.endsWith('.txt')) {
        showError('Please select a .txt file');
        return;
    }

    // Update file badge
    document.getElementById('fileStatus').textContent = 'Uploading...';

    showLoading('Reading file...');

    // Create a FormData object to send the file
    const formData = new FormData();
    formData.append('file', file);

    // Send the file to the server
    fetch('/api/parse', {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(result => {
            hideLoading();
            if (result.success) {
                // Hide the file upload section after successful upload
                document.getElementById('fileUploadSection').classList.add('d-none');

                // Enable search UI
                enableSearchUI();

                showSuccess(`File loaded successfully with ${result.count.toLocaleString()} SNPs`);

                // Update file badge with reupload button
                const fileBadge = document.getElementById('fileBadge');
                fileBadge.innerHTML = `
                    <div class="d-flex align-items-center">
                        <span id="fileStatus" class="me-2">${file.name} (${result.count.toLocaleString()} SNPs)</span>
                        <button id="reuploadButton" class="btn btn-sm btn-light" title="Upload a different file">
                            <i class="bi bi-arrow-repeat"></i>
                        </button>
                    </div>
                `;

                // Add event listener to the reupload button
                document.getElementById('reuploadButton').addEventListener('click', showFileUploadSection);
            } else {
                showError(result.message || 'Failed to parse file');
                document.getElementById('fileStatus').textContent = 'Load Failed';
            }
        })
        .catch(error => {
            hideLoading();
            console.error('Error processing file:', error);
            showError('Error processing file: ' + error.message);
            document.getElementById('fileStatus').textContent = 'Load Failed';
        });
}

// Show file upload section again
function showFileUploadSection() {
    document.getElementById('fileUploadSection').classList.remove('d-none');

    // Reset the file input
    document.getElementById('dnaFile').value = '';

    // Reset the file badge
    document.getElementById('fileBadge').innerHTML = '<span id="fileStatus">No File Loaded</span>';
}

// Handle single RSID search
function handleSearch() {
    // Hide the suggestions
    document.getElementById('suggestionsList').classList.add('d-none');

    const rsidInput = document.getElementById('rsidSearch');
    const rsid = rsidInput.value.trim();

    if (!rsid) {
        showError('Please enter an RSID to search');
        return;
    }

    const startTime = performance.now();
    showLoading('Searching...');

    // Send the search request to the server
    fetch(`/api/search?rsid=${encodeURIComponent(rsid)}`)
        .then(response => response.json())
        .then(result => {
            const endTime = performance.now();
            const searchTime = ((endTime - startTime) / 1000).toFixed(3);

            hideLoading();
            if (result.success) {
                displaySearchResult(result.data, searchTime);
                showSuccess(`Found RSID: ${result.data.rsid}`);
            } else {
                showError(result.message || `RSID ${rsid} not found`);
                displayNoResults(rsid);
            }
        })
        .catch(error => {
            hideLoading();
            console.error('Error searching for RSID:', error);
            showError('Error searching for RSID: ' + error.message);
        });
}

// Handle batch RSID search
function handleBatchSearch() {
    const batchInput = document.getElementById('batchSearch');
    const batchText = batchInput.value.trim();

    if (!batchText) {
        showError('Please enter RSIDs to search');
        return;
    }

    // Parse comma-separated values
    const rsids = batchText.split(',')
        .map(rsid => rsid.trim())
        .filter(rsid => rsid.length > 0);

    if (rsids.length === 0) {
        showError('No valid RSIDs found');
        return;
    }

    const startTime = performance.now();
    showLoading(`Searching for ${rsids.length} RSIDs...`);

    // Send the batch search request to the server
    fetch('/api/batch-search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rsids: rsids })
    })
        .then(response => response.json())
        .then(result => {
            const endTime = performance.now();
            const searchTime = ((endTime - startTime) / 1000).toFixed(3);

            hideLoading();
            if (result.success) {
                displayBatchResults(result.data, rsids, searchTime);
                showSuccess(`Found ${result.count} out of ${rsids.length} RSIDs`);
            } else {
                showError(result.message || 'Failed to perform batch search');
                displayNoResults(rsids.join(', '));
            }
        })
        .catch(error => {
            hideLoading();
            console.error('Error performing batch search:', error);
            showError('Error performing batch search: ' + error.message);
        });
}

// Display a single search result
function displaySearchResult(data, searchTime) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsContainer = document.getElementById('searchResults');

    resultsSection.classList.remove('d-none');

    // Generate links in the frontend
    const rsidNum = data.rsid.toLowerCase().startsWith('rs') ? data.rsid.substring(2) : data.rsid;
    const snpediaUrl = `https://www.snpedia.com/index.php/Rs${rsidNum}`;
    const genotypeUrl = `https://www.snpedia.com/index.php/Rs${rsidNum}(${data.allele1};${data.allele2})`;
    const chatgptUrl = `https://chatgpt.com/?q=I+have+${data.rsid}+with+${data.allele1}${data.allele2}.+Simply+and+clearly+explain+what+this+allele+and+genotype+combination+implies+for+me.+Highlight+the+benefits+and+risks,+if+any,+of+this+genotype.`;

    // Display the result in a table format
    let html = `
        <div class="table-responsive">
            <table class="table table-striped rsid-table">
                <thead>
                    <tr>
                        <th>RSID</th>
                        <th>Allele 1</th>
                        <th>Allele 2</th>
                        <th>Chromosome</th>
                        <th>Position</th>
                        <th>Links</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <a href="${snpediaUrl}" target="_blank" class="rsid-link">
                                ${data.rsid}
                            </a>
                        </td>
                        <td>${data.allele1}</td>
                        <td>${data.allele2}</td>
                        <td>${data.chromosome}</td>
                        <td>${data.position.toLocaleString()}</td>
                        <td>
                            <div class="d-flex">
                                <a href="${chatgptUrl}" target="_blank" class="btn btn-sm btn-outline-success me-2" title="Ask ChatGPT">
                                    <i class="bi bi-chat-square-text"></i>
                                </a>
                                <a href="${snpediaUrl}" target="_blank" class="btn btn-sm btn-outline-primary me-2" title="View RSID on SNPedia">
                                    <i class="bi bi-box-arrow-up-right"></i>
                                </a>
                                <a href="${genotypeUrl}" target="_blank" class="btn btn-sm btn-outline-info" title="View (${data.allele1};${data.allele2}) Genotype on SNPedia">
                                    <i class="bi bi-clipboard2-pulse"></i>
                                </a>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div class="response-time">Search completed in ${searchTime} seconds</div>
        </div>
    `;

    resultsContainer.innerHTML = html;
}


// Display batch search results
function displayBatchResults(results, requestedRsids, searchTime) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsContainer = document.getElementById('searchResults');

    resultsSection.classList.remove('d-none');

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="alert alert-warning">
                No matches found for: ${requestedRsids.join(', ')}
            </div>
        `;
        return;
    }

    // Create a table for results
    let html = `
        <div class="table-responsive">
            <table class="table table-striped rsid-table">
                <thead>
                    <tr>
                        <th>RSID</th>
                        <th>Allele 1</th>
                        <th>Allele 2</th>
                        <th>Chromosome</th>
                        <th>Position</th>
                        <th>Links</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Add each result to the table
    results.forEach(result => {
        // Generate links in the frontend
        const rsidNum = result.rsid.toLowerCase().startsWith('rs') ? result.rsid.substring(2) : result.rsid;
        const snpediaUrl = `https://www.snpedia.com/index.php/Rs${rsidNum}`;
        const genotypeUrl = `https://www.snpedia.com/index.php/Rs${rsidNum}(${result.allele1};${result.allele2})`;
        const chatgptUrl = `https://chatgpt.com/?q=I+have+${result.rsid}+with+${result.allele1}${result.allele2}.+Simply+and+clearly+explain+what+this+allele+and+genotype+combination+implies+for+me.+Highlight+the+benefits+and+risks,+if+any,+of+this+genotype.`;
    
        // Then in the HTML table Links column:
        html += `
            <tr>
                <td>
                    <a href="${snpediaUrl}" target="_blank" class="rsid-link">
                        ${result.rsid}
                    </a>
                </td>
                <td>${result.allele1}</td>
                <td>${result.allele2}</td>
                <td>${result.chromosome}</td>
                <td>${result.position.toLocaleString()}</td>
                <td>
                    <div class="d-flex">
                        <a href="${chatgptUrl}" target="_blank" class="btn btn-sm btn-outline-success me-2" title="Ask ChatGPT">
                            <i class="bi bi-chat-square-text"></i>
                        </a>
                        <a href="${snpediaUrl}" target="_blank" class="btn btn-sm btn-outline-primary me-2" title="View RSID on SNPedia">
                            <i class="bi bi-box-arrow-up-right"></i>
                        </a>
                        <a href="${genotypeUrl}" target="_blank" class="btn btn-sm btn-outline-info" title="View (${result.allele1};${result.allele2}) Genotype on SNPedia">
                            <i class="bi bi-clipboard2-pulse"></i>
                        </a>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
            <div class="response-time">Search completed in ${searchTime} seconds</div>
        </div>
    `;

    // Check for missing RSIDs
    const foundRsids = results.map(r => r.rsid);
    const missingRsids = requestedRsids.filter(rsid => {
        // Add rs prefix if not present
        let normalizedRsid = rsid;
        if (!normalizedRsid.toLowerCase().startsWith('rs')) {
            normalizedRsid = 'rs' + normalizedRsid;
        }
        return !foundRsids.some(fr => fr.toLowerCase() === normalizedRsid.toLowerCase());
    });

    if (missingRsids.length > 0) {
        html += `
            <div class="alert alert-warning mt-3">
                <strong>Not Found:</strong> ${missingRsids.join(', ')}
            </div>
        `;
    }

    resultsContainer.innerHTML = html;
}

// Display no results found
function displayNoResults(rsid) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsContainer = document.getElementById('searchResults');

    resultsSection.classList.remove('d-none');

    // Normalize the RSID for the SNPedia link
    let normalizedRsid = rsid;
    if (!normalizedRsid.toLowerCase().startsWith('rs')) {
        normalizedRsid = 'rs' + normalizedRsid;
    }
    const rsidNum = normalizedRsid.replace(/^rs/i, '');
    const snpediaUrl = `https://www.snpedia.com/index.php/Rs${rsidNum}`;
    const chatgptUrl = `https://chatgpt.com/?q=Tell+me+about+SNP+${normalizedRsid}`;

    resultsContainer.innerHTML = `
        <div class="alert alert-warning">
            <p>No match found for: ${normalizedRsid}</p>
            <p>This RSID may not be in your file, but you can still check:
               <div class="mt-2">
                   <a href="${snpediaUrl}" target="_blank" class="btn btn-sm btn-outline-primary me-2">
                       <i class="bi bi-box-arrow-up-right me-1"></i>SNPedia
                   </a>
                   <a href="${chatgptUrl}" target="_blank" class="btn btn-sm btn-outline-success">
                       <i class="bi bi-chat-square-text me-1"></i>ChatGPT
                   </a>
               </div>
            </p>
        </div>
    `;
}

// Enable the search UI
function enableSearchUI() {
    document.getElementById('searchSection').classList.remove('d-none');
}

// Show the loading indicator
function showLoading(message = 'Processing...') {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingMessage = document.getElementById('loadingMessage');

    loadingMessage.textContent = message;
    loadingIndicator.classList.remove('d-none');
}

// Hide the loading indicator
function hideLoading() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.classList.add('d-none');
}

// Show an error message
function showError(message) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsContainer = document.getElementById('searchResults');

    resultsSection.classList.remove('d-none');

    resultsContainer.innerHTML = `
        <div class="alert alert-danger">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>${message}
        </div>
    `;
}

// Show a success message
function showSuccess(message) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsContainer = document.getElementById('searchResults');

    const currentHTML = resultsContainer.innerHTML;

    resultsContainer.innerHTML = `
        <div class="alert alert-success mb-3">
            <i class="bi bi-check-circle-fill me-2"></i>${message}
        </div>
        ${currentHTML}
    `;
}

// Clear search results
function clearResults() {
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = `<p class="text-muted">Search results will appear here</p>`;
    document.getElementById('rsidSearch').value = '';
    document.getElementById('batchSearch').value = '';
}
