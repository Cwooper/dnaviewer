package search

import (
	"sort"
	"strings"

	"github.com/Cwooper/dnaviewer/model"
)

// BinarySearch performs a binary search on the SNP collection
// Returns the found SNP or nil if not found
func BinarySearch(collection *model.SNPCollection, rsid string) *model.SNP {
	// Ensure data is sorted
	collection.Sort()

	// Binary search implementation
	snps := collection.SNPs

	i := sort.Search(len(snps), func(i int) bool {
		return snps[i].RSID >= rsid
	})

	// Check if we found a match - must match exactly (not a submatch)
	if i < len(snps) && snps[i].RSID == rsid {
		return &snps[i]
	}

	return nil // Not found
}

// FindRSIDs searches for multiple RSIDs and returns all matches
func FindRSIDs(collection *model.SNPCollection, rsids []string) []*model.SNP {
	results := make([]*model.SNP, 0)

	for _, rsid := range rsids {
		// Add "rs" prefix if not present
		if !strings.HasPrefix(strings.ToLower(rsid), "rs") {
			rsid = "rs" + rsid
		}

		if result := BinarySearch(collection, rsid); result != nil {
			results = append(results, result)
		}
	}

	return results
}

// FindPartialMatches finds RSIDs that start with the given prefix
// Returns a list of RSIDs that match (not full SNP objects)
func FindPartialMatches(collection *model.SNPCollection, prefix string, limit int) []string {
	// Ensure data is sorted
	collection.Sort()

	// Convert prefix to lowercase for case-insensitive matching
	lowerPrefix := strings.ToLower(prefix)

	matches := make([]string, 0, limit)
	snps := collection.SNPs

	// Find the first potential match using binary search
	i := sort.Search(len(snps), func(i int) bool {
		return strings.ToLower(snps[i].RSID) >= lowerPrefix
	})

	// Collect matches up to the limit
	for i < len(snps) && len(matches) < limit {
		if strings.HasPrefix(strings.ToLower(snps[i].RSID), lowerPrefix) {
			matches = append(matches, snps[i].RSID)
		} else if strings.ToLower(snps[i].RSID) > lowerPrefix {
			// Once we've moved past potential matches, break
			break
		}
		i++
	}

	return matches
}
