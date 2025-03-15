package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/Cwooper/dnaviewer/model"
	"github.com/Cwooper/dnaviewer/parser"
	"github.com/Cwooper/dnaviewer/search"
)

// Embed the web directory
//
//go:embed web
var webFS embed.FS

// Store the DNA collection in memory
var dnaCollection *model.SNPCollection

// HeartbeatManager tracks active connections
type HeartbeatManager struct {
	clients      map[string]time.Time
	mutex        sync.Mutex
	lastActivity time.Time
}

// Create a new heartbeat manager
var heartbeatManager = &HeartbeatManager{
	clients:      make(map[string]time.Time),
	lastActivity: time.Now(),
}

// RegisterClient adds a client to the heartbeat manager
func (h *HeartbeatManager) RegisterClient(clientID string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	h.clients[clientID] = time.Now()
	h.lastActivity = time.Now()
}

// UpdateClient updates the last heartbeat time for a client
func (h *HeartbeatManager) UpdateClient(clientID string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	h.clients[clientID] = time.Now()
	h.lastActivity = time.Now()
}

// RemoveClient removes a client from the heartbeat manager
func (h *HeartbeatManager) RemoveClient(clientID string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	delete(h.clients, clientID)
}

// GetActiveClientCount returns the number of active clients
func (h *HeartbeatManager) GetActiveClientCount() int {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	// Clean up any clients that haven't sent a heartbeat in the last 30 seconds
	now := time.Now()
	for id, lastHeartbeat := range h.clients {
		if now.Sub(lastHeartbeat) > 30*time.Second {
			delete(h.clients, id)
		}
	}

	return len(h.clients)
}

// GetLastActivity returns the time of the last activity
func (h *HeartbeatManager) GetLastActivity() time.Time {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	return h.lastActivity
}

// Main function
func main() {
	fmt.Println("Starting DNA Viewer...")

	// Get available port
	port := getAvailablePort()
	if port == 0 {
		log.Fatal("Could not find an available port")
	}

	// Create a server
	server := &http.Server{
		Addr:    fmt.Sprintf("127.0.0.1:%d", port),
		Handler: setupRouter(),
	}

	// Create a context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start server in a goroutine
	go func() {
		fmt.Printf("Server running at http://localhost:%d\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Open browser after a short delay
	time.Sleep(500 * time.Millisecond)
	openBrowser(fmt.Sprintf("http://localhost:%d", port))

	// Start a goroutine to check for inactivity
	go func() {
		inactivityTimer := time.NewTicker(15 * time.Second)
		defer inactivityTimer.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-inactivityTimer.C:
				activeClients := heartbeatManager.GetActiveClientCount()
				lastActivity := heartbeatManager.GetLastActivity()

				// If there are no active clients and it's been more than 1 minute since last activity
				if activeClients == 0 && time.Since(lastActivity) > 1*time.Minute {
					fmt.Println("No active clients detected for over 1 minute. Shutting down...")

					// Gracefully shutdown the server
					shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer shutdownCancel()

					if err := server.Shutdown(shutdownCtx); err != nil {
						log.Printf("Error during server shutdown: %v", err)
					}

					// Exit the application
					os.Exit(0)
				}
			}
		}
	}()

	// Wait for shutdown signal
	<-ctx.Done()
}

// Setup HTTP router
func setupRouter() http.Handler {
	// Create a file system from the embedded files
	content, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatal(err)
	}

	// Create mux router
	mux := http.NewServeMux()

	// Serve static files
	mux.Handle("/", http.FileServer(http.FS(content)))

	// API endpoints
	mux.HandleFunc("/api/parse", handleParseDNA)
	mux.HandleFunc("/api/search", handleSearch)
	mux.HandleFunc("/api/batch-search", handleBatchSearch)
	mux.HandleFunc("/api/stats", handleGetStats)
	mux.HandleFunc("/api/heartbeat", handleHeartbeat)
	mux.HandleFunc("/api/shutdown", handleShutdown)

	return mux
}

// Handle client heartbeats to track active connections
func handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get client ID from the request
	var request struct {
		ClientID string `json:"clientId"`
	}

	err := json.NewDecoder(r.Body).Decode(&request)
	if err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Register or update the client
	if _, ok := heartbeatManager.clients[request.ClientID]; !ok {
		heartbeatManager.RegisterClient(request.ClientID)
	} else {
		heartbeatManager.UpdateClient(request.ClientID)
	}

	// Return success
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"success":true}`))
}

// Handle shutdown request
func handleShutdown(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get client ID from the request
	var request struct {
		ClientID string `json:"clientId"`
	}

	err := json.NewDecoder(r.Body).Decode(&request)
	if err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Remove the client
	heartbeatManager.RemoveClient(request.ClientID)

	// Return success
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"success":true}`))

	// If this was the last client, initiate shutdown after a short delay
	go func() {
		time.Sleep(1 * time.Second) // Wait to ensure any other requests complete

		if heartbeatManager.GetActiveClientCount() == 0 {
			fmt.Println("Received shutdown request. Exiting...")
			os.Exit(0)
		}
	}()
}

// Handle parsing DNA file
func handleParseDNA(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form
	err := r.ParseMultipartForm(100 << 20) // 100 MB max
	if err != nil {
		sendErrorResponse(w, "Failed to parse form: "+err.Error())
		return
	}

	// Get file from form
	file, _, err := r.FormFile("file")
	if err != nil {
		sendErrorResponse(w, "Failed to get file: "+err.Error())
		return
	}
	defer file.Close()

	// Parse the DNA file
	dnaCollection, err = parser.ParseDNAFile(file)
	if err != nil {
		sendErrorResponse(w, "Failed to parse DNA file: "+err.Error())
		return
	}

	// Return success response
	sendJSONResponse(w, map[string]interface{}{
		"success": true,
		"count":   dnaCollection.TotalLoaded,
		"message": fmt.Sprintf("Successfully loaded %d SNPs", dnaCollection.TotalLoaded),
	})
}

// Handle searching for an RSID
func handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if data is loaded
	if dnaCollection == nil || len(dnaCollection.SNPs) == 0 {
		sendErrorResponse(w, "No DNA data loaded")
		return
	}

	// Get RSID from query parameters
	rsid := r.URL.Query().Get("rsid")
	if rsid == "" {
		sendErrorResponse(w, "Missing RSID parameter")
		return
	}

	// Add "rs" prefix if not present
	if !strings.HasPrefix(strings.ToLower(rsid), "rs") {
		rsid = "rs" + rsid
	}

	// Get partial parameter for live search
	partialSearch := r.URL.Query().Get("partial") == "true"

	// If it's a partial search, find potential matches
	if partialSearch {
		// Find up to 10 potential matches that start with the provided string
		matches := search.FindPartialMatches(dnaCollection, rsid, 10)

		// Return the partial matches
		sendJSONResponse(w, map[string]interface{}{
			"success": true,
			"partial": true,
			"matches": matches,
			"count":   len(matches),
		})
		return
	}

	// Perform exact binary search
	result := search.BinarySearch(dnaCollection, rsid)

	if result == nil {
		sendJSONResponse(w, map[string]interface{}{
			"success": false,
			"message": fmt.Sprintf("RSID %s not found", rsid),
		})
		return
	}

	// Return the found SNP
	sendJSONResponse(w, map[string]interface{}{
		"success": true,
		"data":    result.ToJSObject(),
		"message": fmt.Sprintf("Found SNP: %s", rsid),
	})
}

// Handle batch searching for multiple RSIDs
func handleBatchSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if data is loaded
	if dnaCollection == nil || len(dnaCollection.SNPs) == 0 {
		sendErrorResponse(w, "No DNA data loaded")
		return
	}

	// Parse request body
	var requestBody struct {
		RSIDs []string `json:"rsids"`
	}

	err := json.NewDecoder(r.Body).Decode(&requestBody)
	if err != nil {
		sendErrorResponse(w, "Invalid request format: "+err.Error())
		return
	}

	if len(requestBody.RSIDs) == 0 {
		sendErrorResponse(w, "No RSIDs provided")
		return
	}

	// Search for all RSIDs
	results := search.FindRSIDs(dnaCollection, requestBody.RSIDs)

	// Convert results to JS-friendly format
	jsResults := make([]interface{}, len(results))
	for i, result := range results {
		jsResults[i] = result.ToJSObject()
	}

	// Return the results
	sendJSONResponse(w, map[string]interface{}{
		"success": true,
		"data":    jsResults,
		"count":   len(results),
		"message": fmt.Sprintf("Found %d out of %d requested SNPs", len(results), len(requestBody.RSIDs)),
	})
}

// Handle getting file statistics
func handleGetStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if data is loaded
	if dnaCollection == nil {
		sendErrorResponse(w, "No DNA data loaded")
		return
	}

	// Return file statistics
	sendJSONResponse(w, map[string]interface{}{
		"success":   true,
		"totalSNPs": dnaCollection.TotalLoaded,
		"isSorted":  dnaCollection.IsSorted,
		"message":   "File statistics retrieved successfully",
	})
}

// Helper function to send error response
func sendErrorResponse(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"message": message,
	})
}

// Helper function to send JSON response
func sendJSONResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// Find an available port to use
func getAvailablePort() int {
	// Try to find a port between 8080 and 8180
	for port := 8080; port <= 8180; port++ {
		listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			listener.Close()
			return port
		}
	}

	// If no port in the range is available, get a random available port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0
	}
	defer listener.Close()

	return listener.Addr().(*net.TCPAddr).Port
}

// Open a URL in the default browser
func openBrowser(url string) {
	var err error

	switch runtime.GOOS {
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	default: // "linux", "freebsd", etc.
		err = exec.Command("xdg-open", url).Start()
	}

	if err != nil {
		fmt.Println("Could not automatically open browser. Please visit:", url)
	}
}
