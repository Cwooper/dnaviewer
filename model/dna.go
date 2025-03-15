package model

import (
	"sort"
)

// SNP represents a Single Nucleotide Polymorphism from DNA data
type SNP struct {
	RSID       string
	Chromosome string
	Position   int
	Allele1    string
	Allele2    string
}

// SNPCollection is a slice of SNPs with additional functionality
type SNPCollection struct {
	SNPs        []SNP
	IsSorted    bool
	TotalLoaded int
}

// NewSNPCollection creates a new SNP collection
func NewSNPCollection() *SNPCollection {
	return &SNPCollection{
		SNPs:        make([]SNP, 0),
		IsSorted:    false,
		TotalLoaded: 0,
	}
}

// AddSNP adds a new SNP to the collection
func (sc *SNPCollection) AddSNP(snp SNP) {
	sc.SNPs = append(sc.SNPs, snp)
	sc.IsSorted = false
	sc.TotalLoaded++
}

// Sort sorts the SNPs by RSID for binary search
func (sc *SNPCollection) Sort() {
	if !sc.IsSorted {
		sort.Slice(sc.SNPs, func(i, j int) bool {
			return sc.SNPs[i].RSID < sc.SNPs[j].RSID
		})
		sc.IsSorted = true
	}
}

// ToJSObject converts an SNP to a JS-friendly object
func (snp *SNP) ToJSObject() map[string]interface{} {
	return map[string]interface{}{
		"rsid":       snp.RSID,
		"chromosome": snp.Chromosome,
		"position":   snp.Position,
		"allele1":    snp.Allele1,
		"allele2":    snp.Allele2,
	}
}
