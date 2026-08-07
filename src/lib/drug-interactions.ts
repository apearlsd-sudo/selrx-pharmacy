/**
 * src/lib/drug-interactions.ts
 *
 * Basic drug interaction checking system for Nigerian pharmacy POS.
 * Uses a curated set of common drug-drug interactions based on
 * WHO essential medicines and commonly prescribed drugs in Nigeria.
 *
 * This is a WARNING system only — it does not replace professional
 * pharmaceutical judgment. The pharmacist should always review.
 */

// Interaction severity levels
export type InteractionSeverity = 'moderate' | 'severe' | 'critical'

export interface DrugInteraction {
  drug1: string       // Generic name or active ingredient (lowercase)
  drug2: string       // Generic name or active ingredient (lowercase)
  severity: InteractionSeverity
  description: string
  recommendation: string
}

/**
 * Common drug-drug interactions database.
 * Pairs are stored with both orderings for easy lookup.
 * Drug names are matched against product.genericName (case-insensitive, partial match).
 */
const INTERACTIONS: DrugInteraction[] = [
  // --- CRITICAL ---
  {
    drug1: 'metformin',
    drug2: 'contrast media',
    severity: 'critical',
    description: 'Risk of lactic acidosis with iodinated contrast media',
    recommendation: 'Stop metformin 48h before contrast study; resume 48h after if renal function is normal',
  },
  {
    drug1: 'warfarin',
    drug2: 'aspirin',
    severity: 'critical',
    description: 'Increased risk of bleeding',
    recommendation: 'Avoid combination unless specifically prescribed by doctor',
  },
  {
    drug1: 'warfarin',
    drug2: 'ibuprofen',
    severity: 'critical',
    description: 'Increased risk of GI bleeding; NSAIDs reduce warfarin protein binding',
    recommendation: 'Avoid NSAIDs. Use paracetamol for pain instead',
  },
  {
    drug1: 'warfarin',
    drug2: 'diclofenac',
    severity: 'critical',
    description: 'Increased risk of bleeding',
    recommendation: 'Avoid combination. Use paracetamol for pain',
  },
  {
    drug1: 'clopidogrel',
    drug2: 'omeprazole',
    severity: 'critical',
    description: 'Omeprazole reduces the antiplatelet effect of clopidogrel via CYP2C19 inhibition',
    recommendation: 'Use pantoprazole instead of omeprazole',
  },
  {
    drug1: 'ciprofloxacin',
    drug2: 'theophylline',
    severity: 'critical',
    description: 'Ciprofloxacin inhibits theophylline metabolism, risk of toxicity',
    recommendation: 'Monitor theophylline levels; reduce dose if needed',
  },
  {
    drug1: 'methotrexate',
    drug2: 'trimethoprim',
    severity: 'critical',
    description: 'Both are folate antagonists; risk of severe bone marrow suppression',
    recommendation: 'Avoid combination',
  },
  {
    drug1: 'potassium chloride',
    drug2: 'spironolactone',
    severity: 'critical',
    description: 'Risk of hyperkalemia',
    recommendation: 'Monitor potassium levels closely',
  },

  // --- SEVERE ---
  {
    drug1: 'enalapril',
    drug2: 'potassium',
    severity: 'severe',
    description: 'ACE inhibitors + potassium supplements increase risk of hyperkalemia',
    recommendation: 'Monitor potassium. Avoid potassium supplements unless prescribed',
  },
  {
    drug1: 'lisinopril',
    drug2: 'potassium',
    severity: 'severe',
    description: 'ACE inhibitors + potassium increase risk of hyperkalemia',
    recommendation: 'Monitor potassium levels',
  },
  {
    drug1: 'losartan',
    drug2: 'potassium',
    severity: 'severe',
    description: 'ARBs + potassium increase risk of hyperkalemia',
    recommendation: 'Monitor potassium levels',
  },
  {
    drug1: 'amlodipine',
    drug2: 'simvastatin',
    severity: 'severe',
    description: 'Amlodipine increases simvastatin exposure; risk of myopathy',
    recommendation: 'Limit simvastatin to 20mg/day with amlodipine',
  },
  {
    drug1: 'atorvastatin',
    drug2: 'clarithromycin',
    severity: 'severe',
    description: 'Clarithromycin inhibits atorvastatin metabolism; risk of rhabdomyolysis',
    recommendation: 'Hold atorvastatin during clarithromycin course',
  },
  {
    drug1: 'carbamazepine',
    drug2: 'erythromycin',
    severity: 'severe',
    description: 'Erythromycin inhibits carbamazepine metabolism; risk of toxicity',
    recommendation: 'Monitor carbamazepine levels; use azithromycin as alternative',
  },
  {
    drug1: 'digoxin',
    drug2: 'verapamil',
    severity: 'severe',
    description: 'Verapamil increases digoxin levels; risk of digoxin toxicity',
    recommendation: 'Reduce digoxin dose by 50% when starting verapamil',
  },
  {
    drug1: 'metronidazole',
    drug2: 'alcohol',
    severity: 'severe',
    description: 'Disulfiram-like reaction with alcohol',
    recommendation: 'Advise patient: no alcohol during treatment and 72h after',
  },
  {
    drug1: 'ciprofloxacin',
    drug2: 'aluminum hydroxide',
    severity: 'severe',
    description: 'Antacids reduce ciprofloxacin absorption',
    recommendation: 'Separate doses by at least 2 hours',
  },
  {
    drug1: 'fluoxetine',
    drug2: 'tramadol',
    severity: 'severe',
    description: 'Increased risk of serotonin syndrome and seizures',
    recommendation: 'Use alternative analgesic. If unavoidable, monitor closely',
  },

  // --- MODERATE ---
  {
    drug1: 'amoxicillin',
    drug2: 'allopurinol',
    severity: 'moderate',
    description: 'Increased risk of ampicillin/allopurinol rash',
    recommendation: 'Monitor for skin reactions',
  },
  {
    drug1: 'paracetamol',
    drug2: 'warfarin',
    severity: 'moderate',
    description: 'High-dose paracetamol may increase INR',
    recommendation: 'Limit to standard doses; monitor INR if prolonged use',
  },
  {
    drug1: 'ibuprofen',
    drug2: 'lisinopril',
    severity: 'moderate',
    description: 'NSAIDs reduce antihypertensive effect; risk of renal impairment',
    recommendation: 'Short-term use only; monitor BP and renal function',
  },
  {
    drug1: 'aspirin',
    drug2: 'ibuprofen',
    severity: 'moderate',
    description: 'Ibuprofen may interfere with aspirin antiplatelet effect',
    recommendation: 'Take ibuprofen at least 30min after or 8h before aspirin',
  },
  {
    drug1: 'iron',
    drug2: 'ciprofloxacin',
    severity: 'moderate',
    description: 'Iron reduces ciprofloxacin absorption',
    recommendation: 'Separate doses by at least 2 hours',
  },
  {
    drug1: 'calcium',
    drug2: 'ciprofloxacin',
    severity: 'moderate',
    description: 'Calcium reduces fluoroquinolone absorption',
    recommendation: 'Separate doses by at least 2 hours',
  },
  {
    drug1: 'antacid',
    drug2: 'itraconazole',
    severity: 'moderate',
    description: 'Antacids reduce itraconazole absorption',
    recommendation: 'Separate doses by at least 2 hours',
  },
  {
    drug1: 'hydrochlorothiazide',
    drug2: 'diclofenac',
    severity: 'moderate',
    description: 'NSAIDs may reduce diuretic effect; risk of renal impairment',
    recommendation: 'Monitor renal function with combined use',
  },
]

/**
 * Check if adding a new drug to the cart interacts with any existing cart items.
 *
 * @param newDrugName - The genericName of the product being added
 * @param existingCartGenericNames - Array of genericName strings already in the cart
 * @returns Array of detected interactions
 */
export function checkDrugInteractions(
  newDrugName: string | null | undefined,
  existingCartGenericNames: string[]
): DrugInteraction[] {
  if (!newDrugName) return []

  const newLower = newDrugName.toLowerCase().trim()
  const found: DrugInteraction[] = []

  for (const interaction of INTERACTIONS) {
    // Check if the new drug matches drug1 or drug2
    const isNewDrug1 = newLower.includes(interaction.drug1) || interaction.drug1.includes(newLower)
    const isNewDrug2 = newLower.includes(interaction.drug2) || interaction.drug2.includes(newLower)

    if (!isNewDrug1 && !isNewDrug2) continue

    // Now check if any existing cart item matches the other drug
    const otherDrug = isNewDrug1 ? interaction.drug2 : interaction.drug1

    const hasMatch = existingCartGenericNames.some((existing) => {
      const existingLower = existing.toLowerCase().trim()
      return existingLower.includes(otherDrug) || otherDrug.includes(existingLower)
    })

    if (hasMatch) {
      found.push(interaction)
    }
  }

  return found
}

/**
 * Get a color class for an interaction severity badge.
 */
export function getSeverityColor(severity: InteractionSeverity): string {
  switch (severity) {
    case 'critical': return 'bg-red-100 text-red-800 border-red-200'
    case 'severe':   return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'moderate': return 'bg-amber-100 text-amber-800 border-amber-200'
  }
}

/**
 * Get a human-readable label for severity.
 */
export function getSeverityLabel(severity: InteractionSeverity): string {
  switch (severity) {
    case 'critical': return 'Critical'
    case 'severe':   return 'Severe'
    case 'moderate': return 'Moderate'
  }
}
