package parser

import (
	"bufio"
	"io"
	"strconv"
	"strings"

	"github.com/Cwooper/dnaviewer/model"
)

// ParseDNAFile reads and parses a DNA file into an SNPCollection
func ParseDNAFile(reader io.Reader) (*model.SNPCollection, error) {
	collection := model.NewSNPCollection()
	scanner := bufio.NewScanner(reader)

	// Skip header lines (comments starting with #)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "#") {
			break
		}
	}

	// Process data lines
	lineCount := 0
	for scanner.Scan() {
		lineCount++
		line := scanner.Text()

		// Try tab-delimited first
		fields := strings.Split(line, "\t")

		// If not tab-delimited, try space-delimited
		if len(fields) != 5 {
			fields = strings.Fields(line)
		}

		// Ensure we have the expected number of fields
		if len(fields) != 5 {
			continue // Skip malformed lines
		}

		// Parse position as integer
		position, err := strconv.Atoi(fields[2])
		if err != nil {
			// If position can't be parsed, default to 0
			position = 0
		}

		// Create SNP struct and add to collection
		snp := model.SNP{
			RSID:       fields[0],
			Chromosome: fields[1],
			Position:   position,
			Allele1:    fields[3],
			Allele2:    fields[4],
		}
		collection.AddSNP(snp)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	// Sort the SNP collection for binary search
	collection.Sort()

	return collection, nil
}

// ParseDNAString parses DNA data from a string source
func ParseDNAString(content string) (*model.SNPCollection, error) {
	reader := strings.NewReader(content)
	return ParseDNAFile(reader)
}
