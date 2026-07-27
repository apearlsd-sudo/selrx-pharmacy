import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding SelRx database...')

  // ============ USERS ============
  console.log('  Creating users...')
  const admin = await db.user.create({
    data: {
      email: 'admin@selrx.com',
      password: 'admin123',
      name: 'Dr. Sarah Chen',
      role: 'SUPER_ADMIN',
      phone: '(555) 100-0001',
      active: true,
    },
  })

  const pharmacist = await db.user.create({
    data: {
      email: 'pharmacist@selrx.com',
      password: 'pharm123',
      name: 'Dr. James Wilson',
      role: 'PHARMACIST',
      phone: '(555) 100-0002',
      licenseNumber: 'RPh-12345',
      active: true,
    },
  })

  const technician = await db.user.create({
    data: {
      email: 'tech@selrx.com',
      password: 'tech123',
      name: 'Maria Garcia',
      role: 'TECHNICIAN',
      phone: '(555) 100-0003',
      active: true,
    },
  })

  const cashier = await db.user.create({
    data: {
      email: 'cashier@selrx.com',
      password: 'cash123',
      name: 'John Smith',
      role: 'CASHIER',
      phone: '(555) 100-0004',
      active: true,
    },
  })

  const clerk = await db.user.create({
    data: {
      email: 'clerk@selrx.com',
      password: 'clerk123',
      name: 'Emily Davis',
      role: 'CLERK',
      phone: '(555) 100-0005',
      active: true,
    },
  })

  console.log('  ✅ 5 users created')

  // ============ CUSTOMERS ============
  console.log('  Creating customers...')
  const customer1 = await db.customer.create({
    data: {
      firstName: 'Robert',
      lastName: 'Johnson',
      email: 'robert.johnson@email.com',
      phone: '(555) 200-0001',
      dateOfBirth: '1965-03-15',
      gender: 'Male',
      address: '142 Oak Street, Springfield, IL 62701',
      insuranceProvider: 'Blue Cross Blue Shield',
      insurancePolicyNo: 'BCBS-789456123',
      allergies: 'Penicillin, Sulfa',
      notes: 'Regular patient, prefers generic medications',
    },
  })

  const customer2 = await db.customer.create({
    data: {
      firstName: 'Patricia',
      lastName: 'Williams',
      email: 'patricia.w@email.com',
      phone: '(555) 200-0002',
      dateOfBirth: '1972-08-22',
      gender: 'Female',
      address: '890 Maple Avenue, Springfield, IL 62702',
      insuranceProvider: 'Aetna',
      insurancePolicyNo: 'AET-456789012',
      allergies: 'Aspirin',
      notes: 'Diabetic patient, monitor blood sugar closely',
    },
  })

  const customer3 = await db.customer.create({
    data: {
      firstName: 'Michael',
      lastName: 'Brown',
      email: 'm.brown@email.com',
      phone: '(555) 200-0003',
      dateOfBirth: '1958-11-30',
      gender: 'Male',
      address: '321 Elm Drive, Springfield, IL 62703',
      insuranceProvider: 'Medicare',
      insurancePolicyNo: 'MCR-123456789',
      allergies: 'Latex',
    },
  })

  const customer4 = await db.customer.create({
    data: {
      firstName: 'Jennifer',
      lastName: 'Martinez',
      phone: '(555) 200-0004',
      dateOfBirth: '1985-01-12',
      gender: 'Female',
      address: '567 Pine Road, Springfield, IL 62704',
      insuranceProvider: 'UnitedHealth',
      insurancePolicyNo: 'UHC-987654321',
    },
  })

  const customer5 = await db.customer.create({
    data: {
      firstName: 'David',
      lastName: 'Anderson',
      email: 'david.a@email.com',
      phone: '(555) 200-0005',
      dateOfBirth: '1990-06-08',
      gender: 'Male',
      address: '234 Cedar Lane, Springfield, IL 62705',
      allergies: 'Codeine, Penicillin',
      notes: 'No insurance, self-pay patient',
    },
  })

  const customer6 = await db.customer.create({
    data: {
      firstName: 'Linda',
      lastName: 'Taylor',
      phone: '(555) 200-0006',
      dateOfBirth: '1978-09-25',
      gender: 'Female',
      address: '678 Birch Court, Springfield, IL 62706',
      insuranceProvider: 'Cigna',
      insurancePolicyNo: 'CIG-654321987',
      allergies: 'Sulfa drugs',
    },
  })

  const customer7 = await db.customer.create({
    data: {
      firstName: 'William',
      lastName: 'Thomas',
      email: 'will.t@email.com',
      phone: '(555) 200-0007',
      dateOfBirth: '1960-12-01',
      gender: 'Male',
      address: '901 Walnut Street, Springfield, IL 62707',
      insuranceProvider: 'Humana',
      insurancePolicyNo: 'HUM-321654987',
      allergies: 'Ibuprofen',
      notes: 'Heart condition - needs careful monitoring',
    },
  })

  const customer8 = await db.customer.create({
    data: {
      firstName: 'Susan',
      lastName: 'Jackson',
      phone: '(555) 200-0008',
      dateOfBirth: '1988-04-17',
      gender: 'Female',
      address: '456 Spruce Blvd, Springfield, IL 62708',
    },
  })

  console.log('  ✅ 8 customers created')

  // ============ PRODUCTS ============
  console.log('  Creating products...')

  // OTC Products
  const prodIbuprofen = await db.product.create({
    data: {
      ndc: '0002-1234-01',
      name: 'Ibuprofen 200mg',
      genericName: 'Ibuprofen',
      manufacturer: 'Pfizer',
      category: 'OTC',
      description: 'Pain reliever and anti-inflammatory, 100 tablets',
      dosageForm: 'Tablet',
      strength: '200mg',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 8.99,
      costPrice: 3.50,
      reorderPoint: 20,
      reorderQty: 100,
      maxStock: 500,
      storageLocation: 'A1-B2',
      batchNumber: 'IBU-2024-001',
      expiryDate: '2026-06-15',
      controlledSubstance: false,
    },
  })

  const prodAcetaminophen = await db.product.create({
    data: {
      ndc: '0002-2234-02',
      name: 'Acetaminophen 500mg',
      genericName: 'Acetaminophen',
      manufacturer: 'Johnson & Johnson',
      category: 'OTC',
      description: 'Pain reliever and fever reducer, 100 tablets',
      dosageForm: 'Tablet',
      strength: '500mg',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 7.49,
      costPrice: 2.80,
      reorderPoint: 25,
      reorderQty: 100,
      maxStock: 500,
      storageLocation: 'A1-B2',
      batchNumber: 'ACE-2024-001',
      expiryDate: '2026-09-20',
      controlledSubstance: false,
    },
  })

  const prodLoratadine = await db.product.create({
    data: {
      ndc: '0002-3234-03',
      name: 'Loratadine 10mg',
      genericName: 'Loratadine',
      manufacturer: 'Bayer',
      category: 'OTC',
      description: 'Non-drowsy antihistamine, 30 tablets',
      dosageForm: 'Tablet',
      strength: '10mg',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 12.99,
      costPrice: 5.20,
      reorderPoint: 15,
      reorderQty: 60,
      maxStock: 300,
      storageLocation: 'A2-C1',
      batchNumber: 'LOR-2024-001',
      expiryDate: '2026-12-01',
      controlledSubstance: false,
    },
  })

  const prodOmeprazole = await db.product.create({
    data: {
      ndc: '0002-4234-04',
      name: 'Omeprazole 20mg',
      genericName: 'Omeprazole',
      manufacturer: 'Procter & Gamble',
      category: 'OTC',
      description: 'Proton pump inhibitor for heartburn, 42 capsules',
      dosageForm: 'Capsule',
      strength: '20mg',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 14.99,
      costPrice: 6.00,
      reorderPoint: 10,
      reorderQty: 50,
      maxStock: 200,
      storageLocation: 'A2-C1',
      batchNumber: 'OMP-2024-001',
      expiryDate: '2026-03-10',
      controlledSubstance: false,
    },
  })

  const prodNaproxen = await db.product.create({
    data: {
      ndc: '0002-5234-05',
      name: 'Naproxen Sodium 220mg',
      genericName: 'Naproxen Sodium',
      manufacturer: 'Bayer',
      category: 'OTC',
      description: 'Pain reliever for arthritis and headache, 50 tablets',
      dosageForm: 'Tablet',
      strength: '220mg',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 9.49,
      costPrice: 4.10,
      reorderPoint: 20,
      reorderQty: 80,
      maxStock: 400,
      storageLocation: 'A1-B3',
      batchNumber: 'NAP-2024-001',
      expiryDate: '2026-07-22',
      controlledSubstance: false,
    },
  })

  // Prescription Products
  const prodAmoxicillin = await db.product.create({
    data: {
      ndc: '0002-6234-06',
      name: 'Amoxicillin 500mg',
      genericName: 'Amoxicillin',
      manufacturer: 'Sandoz',
      category: 'PRESCRIPTION',
      description: 'Antibiotic for bacterial infections, 30 capsules',
      dosageForm: 'Capsule',
      strength: '500mg',
      unitOfMeasure: 'EA',
      requiresPrescription: true,
      status: 'ACTIVE',
      sellingPrice: 12.99,
      costPrice: 4.50,
      reorderPoint: 30,
      reorderQty: 100,
      maxStock: 500,
      storageLocation: 'B1-C2',
      batchNumber: 'AMX-2024-001',
      expiryDate: '2025-11-30',
      controlledSubstance: false,
    },
  })

  const prodMetformin = await db.product.create({
    data: {
      ndc: '0002-7234-07',
      name: 'Metformin 500mg',
      genericName: 'Metformin HCl',
      manufacturer: 'Teva',
      category: 'PRESCRIPTION',
      description: 'Oral antidiabetic medication, 60 tablets',
      dosageForm: 'Tablet',
      strength: '500mg',
      unitOfMeasure: 'EA',
      requiresPrescription: true,
      status: 'ACTIVE',
      sellingPrice: 9.99,
      costPrice: 2.50,
      reorderPoint: 40,
      reorderQty: 200,
      maxStock: 1000,
      storageLocation: 'B1-C3',
      batchNumber: 'MET-2024-001',
      expiryDate: '2026-02-28',
      controlledSubstance: false,
    },
  })

  const prodLisinopril = await db.product.create({
    data: {
      ndc: '0002-8234-08',
      name: 'Lisinopril 10mg',
      genericName: 'Lisinopril',
      manufacturer: 'Lupin',
      category: 'PRESCRIPTION',
      description: 'ACE inhibitor for hypertension, 30 tablets',
      dosageForm: 'Tablet',
      strength: '10mg',
      unitOfMeasure: 'EA',
      requiresPrescription: true,
      status: 'ACTIVE',
      sellingPrice: 14.49,
      costPrice: 3.80,
      reorderPoint: 30,
      reorderQty: 100,
      maxStock: 500,
      storageLocation: 'B1-C3',
      batchNumber: 'LIS-2024-001',
      expiryDate: '2026-05-15',
      controlledSubstance: false,
    },
  })

  const prodAtorvastatin = await db.product.create({
    data: {
      ndc: '0002-9234-09',
      name: 'Atorvastatin 20mg',
      genericName: 'Atorvastatin Calcium',
      manufacturer: 'Ranbaxy',
      category: 'PRESCRIPTION',
      description: 'Statin for cholesterol management, 30 tablets',
      dosageForm: 'Tablet',
      strength: '20mg',
      unitOfMeasure: 'EA',
      requiresPrescription: true,
      status: 'ACTIVE',
      sellingPrice: 18.99,
      costPrice: 5.00,
      reorderPoint: 25,
      reorderQty: 100,
      maxStock: 500,
      storageLocation: 'B1-C4',
      batchNumber: 'ATV-2024-001',
      expiryDate: '2026-08-01',
      controlledSubstance: false,
    },
  })

  const prodAmlodipine = await db.product.create({
    data: {
      ndc: '0002-0234-10',
      name: 'Amlodipine 5mg',
      genericName: 'Amlodipine Besylate',
      manufacturer: 'Pfizer',
      category: 'PRESCRIPTION',
      description: 'Calcium channel blocker for hypertension, 30 tablets',
      dosageForm: 'Tablet',
      strength: '5mg',
      unitOfMeasure: 'EA',
      requiresPrescription: true,
      status: 'ACTIVE',
      sellingPrice: 16.49,
      costPrice: 4.20,
      reorderPoint: 25,
      reorderQty: 100,
      maxStock: 500,
      storageLocation: 'B1-C4',
      batchNumber: 'AML-2024-001',
      expiryDate: '2026-04-10',
      controlledSubstance: false,
    },
  })

  const prodLevothyroxine = await db.product.create({
    data: {
      ndc: '0002-1334-11',
      name: 'Levothyroxine 50mcg',
      genericName: 'Levothyroxine Sodium',
      manufacturer: 'Mylan',
      category: 'PRESCRIPTION',
      description: 'Thyroid hormone replacement, 30 tablets',
      dosageForm: 'Tablet',
      strength: '50mcg',
      unitOfMeasure: 'EA',
      requiresPrescription: true,
      status: 'ACTIVE',
      sellingPrice: 11.99,
      costPrice: 3.20,
      reorderPoint: 20,
      reorderQty: 80,
      maxStock: 400,
      storageLocation: 'B2-C1',
      batchNumber: 'LEV-2024-001',
      expiryDate: '2026-01-20',
      controlledSubstance: false,
    },
  })

  // Supplement Products
  const prodVitaminD = await db.product.create({
    data: {
      ndc: '0003-1234-12',
      name: 'Vitamin D3 1000IU',
      genericName: 'Cholecalciferol',
      manufacturer: 'Nature Made',
      category: 'SUPPLEMENT',
      description: 'Vitamin D3 supplement for bone health, 200 softgels',
      dosageForm: 'Softgel',
      strength: '1000IU',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 14.99,
      costPrice: 5.50,
      reorderPoint: 15,
      reorderQty: 60,
      maxStock: 300,
      storageLocation: 'C1-D1',
      batchNumber: 'VD3-2024-001',
      expiryDate: '2027-03-01',
      controlledSubstance: false,
    },
  })

  const prodFishOil = await db.product.create({
    data: {
      ndc: '0003-2234-13',
      name: 'Fish Oil 1000mg',
      genericName: 'Omega-3 Fatty Acids',
      manufacturer: 'Nordic Naturals',
      category: 'SUPPLEMENT',
      description: 'Omega-3 fish oil for heart health, 180 softgels',
      dosageForm: 'Softgel',
      strength: '1000mg',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 19.99,
      costPrice: 8.00,
      reorderPoint: 10,
      reorderQty: 40,
      maxStock: 200,
      storageLocation: 'C1-D1',
      batchNumber: 'FIS-2024-001',
      expiryDate: '2027-06-15',
      controlledSubstance: false,
    },
  })

  const prodCalcium = await db.product.create({
    data: {
      ndc: '0003-3234-14',
      name: 'Calcium 600mg',
      genericName: 'Calcium Carbonate',
      manufacturer: 'Nature Made',
      category: 'SUPPLEMENT',
      description: 'Calcium supplement with Vitamin D, 120 tablets',
      dosageForm: 'Tablet',
      strength: '600mg',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 10.99,
      costPrice: 4.20,
      reorderPoint: 15,
      reorderQty: 50,
      maxStock: 250,
      storageLocation: 'C1-D2',
      batchNumber: 'CAL-2024-001',
      expiryDate: '2027-01-10',
      controlledSubstance: false,
    },
  })

  const prodMultivitamin = await db.product.create({
    data: {
      ndc: '0003-4234-15',
      name: 'Multivitamin',
      genericName: 'Multivitamin/Mineral Supplement',
      manufacturer: 'Centrum',
      category: 'SUPPLEMENT',
      description: 'Complete daily multivitamin, 130 tablets',
      dosageForm: 'Tablet',
      strength: null,
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 16.99,
      costPrice: 7.00,
      reorderPoint: 15,
      reorderQty: 60,
      maxStock: 300,
      storageLocation: 'C1-D2',
      batchNumber: 'MVT-2024-001',
      expiryDate: '2027-04-20',
      controlledSubstance: false,
    },
  })

  const prodVitaminB12 = await db.product.create({
    data: {
      ndc: '0003-5234-16',
      name: 'Vitamin B12 500mcg',
      genericName: 'Cyanocobalamin',
      manufacturer: 'Nature\'s Bounty',
      category: 'SUPPLEMENT',
      description: 'Vitamin B12 for energy metabolism, 100 tablets',
      dosageForm: 'Tablet',
      strength: '500mcg',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 8.49,
      costPrice: 3.00,
      reorderPoint: 10,
      reorderQty: 40,
      maxStock: 200,
      storageLocation: 'C1-D2',
      batchNumber: 'B12-2024-001',
      expiryDate: '2027-02-28',
      controlledSubstance: false,
    },
  })

  // Medical Device Products
  const prodBPMonitor = await db.product.create({
    data: {
      ndc: '0004-1234-17',
      name: 'Blood Pressure Monitor',
      genericName: 'Digital Blood Pressure Monitor',
      manufacturer: 'Omron',
      category: 'MEDICAL_DEVICE',
      description: 'Automatic upper arm blood pressure monitor with wide-range cuff',
      dosageForm: null,
      strength: null,
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 49.99,
      costPrice: 25.00,
      reorderPoint: 5,
      reorderQty: 20,
      maxStock: 50,
      storageLocation: 'D1-E1',
      controlledSubstance: false,
    },
  })

  const prodGlucoseMeter = await db.product.create({
    data: {
      ndc: '0004-2234-18',
      name: 'Glucose Meter',
      genericName: 'Blood Glucose Monitoring System',
      manufacturer: 'Accu-Chek',
      category: 'MEDICAL_DEVICE',
      description: 'Blood glucose meter with test strips and lancing device',
      dosageForm: null,
      strength: null,
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 34.99,
      costPrice: 15.00,
      reorderPoint: 5,
      reorderQty: 15,
      maxStock: 40,
      storageLocation: 'D1-E1',
      controlledSubstance: false,
    },
  })

  const prodPulseOximeter = await db.product.create({
    data: {
      ndc: '0004-3234-19',
      name: 'Pulse Oximeter',
      genericName: 'Fingertip Pulse Oximeter',
      manufacturer: 'Nonin',
      category: 'MEDICAL_DEVICE',
      description: 'Fingertip pulse oximeter with OLED display',
      dosageForm: null,
      strength: null,
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 29.99,
      costPrice: 12.00,
      reorderPoint: 5,
      reorderQty: 15,
      maxStock: 40,
      storageLocation: 'D1-E2',
      controlledSubstance: false,
    },
  })

  // Personal Care Products
  const prodHandSanitizer = await db.product.create({
    data: {
      ndc: '0005-1234-20',
      name: 'Hand Sanitizer',
      genericName: 'Ethanol Hand Sanitizer',
      manufacturer: 'Purell',
      category: 'PERSONAL_CARE',
      description: 'Antibacterial hand sanitizer gel, 16oz pump bottle',
      dosageForm: 'Gel',
      strength: '70% Ethanol',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 4.99,
      costPrice: 1.80,
      reorderPoint: 30,
      reorderQty: 100,
      maxStock: 500,
      storageLocation: 'E1-F1',
      batchNumber: 'SAN-2024-001',
      expiryDate: '2026-12-31',
      controlledSubstance: false,
    },
  })

  const prodSunscreen = await db.product.create({
    data: {
      ndc: '0005-2234-21',
      name: 'Sunscreen SPF50',
      genericName: 'Avobenzone Sunscreen',
      manufacturer: 'Neutrogena',
      category: 'PERSONAL_CARE',
      description: 'Broad spectrum SPF 50 sunscreen lotion, 6.7oz',
      dosageForm: 'Lotion',
      strength: 'SPF 50',
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 12.49,
      costPrice: 5.50,
      reorderPoint: 15,
      reorderQty: 50,
      maxStock: 200,
      storageLocation: 'E1-F1',
      batchNumber: 'SUN-2024-001',
      expiryDate: '2026-10-01',
      controlledSubstance: false,
    },
  })

  const prodBandAid = await db.product.create({
    data: {
      ndc: '0005-3234-22',
      name: 'Band-Aid Variety Pack',
      genericName: 'Adhesive Bandages',
      manufacturer: 'Johnson & Johnson',
      category: 'PERSONAL_CARE',
      description: 'Assorted sizes adhesive bandages, 100 count',
      dosageForm: null,
      strength: null,
      unitOfMeasure: 'PACK',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 6.99,
      costPrice: 2.50,
      reorderPoint: 20,
      reorderQty: 80,
      maxStock: 400,
      storageLocation: 'E1-F2',
      controlledSubstance: false,
    },
  })

  // Consumables
  const prodMedicineCups = await db.product.create({
    data: {
      ndc: '0006-1234-23',
      name: 'Medicine Cups',
      genericName: 'Disposable Medicine Cups',
      manufacturer: 'Medline',
      category: 'CONSUMABLES',
      description: 'Disposable graduated medicine cups, 500 count',
      dosageForm: null,
      strength: null,
      unitOfMeasure: 'PACK',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 11.99,
      costPrice: 5.00,
      reorderPoint: 10,
      reorderQty: 30,
      maxStock: 100,
      storageLocation: 'F1-G1',
      controlledSubstance: false,
    },
  })

  const prodPillOrganizer = await db.product.create({
    data: {
      ndc: '0006-2234-24',
      name: 'Pill Organizer',
      genericName: 'Weekly Pill Organizer',
      manufacturer: 'Apex',
      category: 'CONSUMABLES',
      description: '7-day pill organizer with AM/PM compartments',
      dosageForm: null,
      strength: null,
      unitOfMeasure: 'EA',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 6.49,
      costPrice: 2.20,
      reorderPoint: 15,
      reorderQty: 50,
      maxStock: 150,
      storageLocation: 'F1-G1',
      controlledSubstance: false,
    },
  })

  const prodRxBags = await db.product.create({
    data: {
      ndc: '0006-3234-25',
      name: 'Prescription Bags',
      genericName: 'Pharmacy Prescription Bags',
      manufacturer: 'Mckesson',
      category: 'CONSUMABLES',
      description: 'Small paper prescription bags with handles, 1000 count',
      dosageForm: null,
      strength: null,
      unitOfMeasure: 'BOX',
      requiresPrescription: false,
      status: 'ACTIVE',
      sellingPrice: 24.99,
      costPrice: 10.00,
      reorderPoint: 5,
      reorderQty: 20,
      maxStock: 60,
      storageLocation: 'F1-G2',
      controlledSubstance: false,
    },
  })

  console.log('  ✅ 25 products created')

  // ============ INVENTORY ============
  console.log('  Creating inventory records...')

  const allProducts = [
    prodIbuprofen,
    prodAcetaminophen,
    prodLoratadine,
    prodOmeprazole,
    prodNaproxen,
    prodAmoxicillin,
    prodMetformin,
    prodLisinopril,
    prodAtorvastatin,
    prodAmlodipine,
    prodLevothyroxine,
    prodVitaminD,
    prodFishOil,
    prodCalcium,
    prodMultivitamin,
    prodVitaminB12,
    prodBPMonitor,
    prodGlucoseMeter,
    prodPulseOximeter,
    prodHandSanitizer,
    prodSunscreen,
    prodBandAid,
    prodMedicineCups,
    prodPillOrganizer,
    prodRxBags,
  ]

  // Quantities: some normal, a few low to trigger alerts
  const quantities = [
    150, 200, 85, 12,  // OTC - Omeprazole is low (reorderPoint 10, but close)
    45, 180, 120, 95, 7, 60,  // Rx - Amlodipine qty 7 < reorderPoint 25 (ALERT!)
    55, 40, 75, 90, 3,  // Supplements - Vitamin B12 qty 3 < reorderPoint 10 (ALERT!)
    12, 8, 15,  // Medical Devices - Glucose Meter qty 8 < reorderPoint 5... no, reorderPoint is 5, so fine. Actually let's make BP Monitor low.
    // Let me redo: BP Monitor reorderPoint is 5, qty 12 is fine. Glucose qty 8 > 5 fine. Let's keep a few alerts.
    // Amlodipine qty 7 < 25, Vitamin B12 qty 3 < 10 - those are alerts
    110, 65, 95,  // Personal Care
    18, 4, 2,  // Consumables - Pill Organizer qty 4 < 15 (ALERT!), Rx Bags qty 2 < 5 (ALERT!)
  ]

  for (let i = 0; i < allProducts.length; i++) {
    await db.inventory.create({
      data: {
        productId: allProducts[i].id,
        quantity: quantities[i],
        lastCounted: new Date(),
      },
    })
  }

  console.log('  ✅ 25 inventory records created')

  // ============ PRESCRIPTIONS ============
  console.log('  Creating prescriptions...')

  const now = new Date()
  const rx1 = await db.prescription.create({
    data: {
      rxNumber: 'RX-20240101-001',
      customerId: customer1.id,
      patientName: 'Robert Johnson',
      prescriberName: 'Dr. Mark Thompson',
      prescriberNPI: '1234567890',
      prescriberPhone: '(555) 300-0001',
      prescriberFax: '(555) 300-0002',
      productName: 'Amoxicillin 500mg',
      productNdc: '0002-6234-06',
      dosage: 'Take 1 capsule 3 times daily for 10 days',
      quantity: 30,
      refillsRemaining: 1,
      refillsTotal: 3,
      daysSupply: 10,
      dispenseAsWritten: false,
      priority: 'ROUTINE',
      status: 'PENDING',
      notes: 'Patient allergic to penicillin - verify cross-sensitivity with amoxicillin before dispensing',
      expiresAt: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
    },
  })

  const rx2 = await db.prescription.create({
    data: {
      rxNumber: 'RX-20240102-002',
      customerId: customer2.id,
      patientName: 'Patricia Williams',
      prescriberName: 'Dr. Lisa Park',
      prescriberNPI: '2345678901',
      prescriberPhone: '(555) 300-0003',
      productName: 'Metformin 500mg',
      productNdc: '0002-7234-07',
      dosage: 'Take 1 tablet twice daily with meals',
      quantity: 60,
      refillsRemaining: 5,
      refillsTotal: 11,
      daysSupply: 30,
      dispenseAsWritten: false,
      priority: 'ROUTINE',
      status: 'IN_PROGRESS',
      filledById: pharmacist.id,
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    },
  })

  const rx3 = await db.prescription.create({
    data: {
      rxNumber: 'RX-20240103-003',
      customerId: customer3.id,
      patientName: 'Michael Brown',
      prescriberName: 'Dr. James Rivera',
      prescriberNPI: '3456789012',
      prescriberPhone: '(555) 300-0005',
      prescriberFax: '(555) 300-0006',
      productName: 'Lisinopril 10mg',
      productNdc: '0002-8234-08',
      dosage: 'Take 1 tablet once daily in the morning',
      quantity: 30,
      refillsRemaining: 2,
      refillsTotal: 5,
      daysSupply: 30,
      dispenseAsWritten: true,
      priority: 'URGENT',
      status: 'READY',
      filledById: pharmacist.id,
      verifiedById: pharmacist.id,
      filledAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      notes: 'Dose increased from 5mg to 10mg. Monitor blood pressure closely.',
    },
  })

  const rx4 = await db.prescription.create({
    data: {
      rxNumber: 'RX-20240104-004',
      customerId: customer7.id,
      patientName: 'William Thomas',
      prescriberName: 'Dr. Sarah Kim',
      prescriberNPI: '4567890123',
      prescriberPhone: '(555) 300-0007',
      productName: 'Atorvastatin 20mg',
      productNdc: '0002-9234-09',
      dosage: 'Take 1 tablet once daily at bedtime',
      quantity: 30,
      refillsRemaining: 3,
      refillsTotal: 5,
      daysSupply: 30,
      dispenseAsWritten: false,
      priority: 'ROUTINE',
      status: 'READY',
      filledById: pharmacist.id,
      verifiedById: pharmacist.id,
      filledAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    },
  })

  const rx5 = await db.prescription.create({
    data: {
      rxNumber: 'RX-20240105-005',
      customerId: customer4.id,
      patientName: 'Jennifer Martinez',
      prescriberName: 'Dr. Mark Thompson',
      prescriberNPI: '1234567890',
      prescriberPhone: '(555) 300-0001',
      productName: 'Levothyroxine 50mcg',
      productNdc: '0002-1334-11',
      dosage: 'Take 1 tablet once daily on empty stomach, 30 min before breakfast',
      quantity: 30,
      refillsRemaining: 10,
      refillsTotal: 12,
      daysSupply: 30,
      dispenseAsWritten: true,
      priority: 'STAT',
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      notes: 'Patient moving to new city soon - fill promptly',
    },
  })

  console.log('  ✅ 5 prescriptions created')

  // ============ TRANSACTIONS ============
  console.log('  Creating transactions...')

  // Helper to create a date N days ago
  const daysAgo = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - days)
    d.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0)
    return d
  }

  const txn1 = await db.transaction.create({
    data: {
      transactionNo: 'TXN-20240725-0001',
      customerId: customer1.id,
      userId: cashier.id,
      subtotal: 32.97,
      tax: 0,
      discount: 0,
      total: 32.97,
      paymentMethod: 'CASH',
      paymentAmount: 35.00,
      changeAmount: 2.03,
      status: 'COMPLETED',
      createdAt: daysAgo(6),
      notes: 'Regular customer',
      items: {
        create: [
          {
            productId: prodIbuprofen.id,
            productName: 'Ibuprofen 200mg',
            quantity: 1,
            unitPrice: 8.99,
            subtotal: 8.99,
            requiresRx: false,
          },
          {
            productId: prodAcetaminophen.id,
            productName: 'Acetaminophen 500mg',
            quantity: 1,
            unitPrice: 7.49,
            subtotal: 7.49,
            requiresRx: false,
          },
          {
            productId: prodBandAid.id,
            productName: 'Band-Aid Variety Pack',
            quantity: 1,
            unitPrice: 6.99,
            subtotal: 6.99,
            requiresRx: false,
          },
          {
            productId: prodHandSanitizer.id,
            productName: 'Hand Sanitizer',
            quantity: 2,
            unitPrice: 4.99,
            subtotal: 9.98,
            requiresRx: false,
          },
        ],
      },
    },
  })

  const txn2 = await db.transaction.create({
    data: {
      transactionNo: 'TXN-20240725-0002',
      customerId: customer3.id,
      userId: cashier.id,
      subtotal: 83.97,
      tax: 0,
      discount: 0,
      total: 83.97,
      paymentMethod: 'INSURANCE',
      paymentAmount: 83.97,
      changeAmount: 0,
      status: 'COMPLETED',
      prescriptionId: rx3.id,
      createdAt: daysAgo(5),
      items: {
        create: [
          {
            productId: prodLisinopril.id,
            productName: 'Lisinopril 10mg',
            quantity: 1,
            unitPrice: 14.49,
            subtotal: 14.49,
            requiresRx: true,
            dispensedQty: 30,
          },
          {
            productId: prodAmlodipine.id,
            productName: 'Amlodipine 5mg',
            quantity: 1,
            unitPrice: 16.49,
            subtotal: 16.49,
            requiresRx: true,
            dispensedQty: 30,
          },
          {
            productId: prodAtorvastatin.id,
            productName: 'Atorvastatin 20mg',
            quantity: 1,
            unitPrice: 18.99,
            subtotal: 18.99,
            requiresRx: true,
            dispensedQty: 30,
          },
          {
            productId: prodVitaminD.id,
            productName: 'Vitamin D3 1000IU',
            quantity: 1,
            unitPrice: 14.99,
            subtotal: 14.99,
            requiresRx: false,
          },
          {
            productId: prodFishOil.id,
            productName: 'Fish Oil 1000mg',
            quantity: 1,
            unitPrice: 19.99,
            subtotal: 19.99,
            requiresRx: false,
          },
        ],
      },
    },
  })

  const txn3 = await db.transaction.create({
    data: {
      transactionNo: 'TXN-20240726-0003',
      customerId: customer2.id,
      userId: cashier.id,
      subtotal: 56.97,
      tax: 0,
      discount: 0,
      total: 56.97,
      paymentMethod: 'INSURANCE',
      paymentAmount: 56.97,
      changeAmount: 0,
      status: 'COMPLETED',
      prescriptionId: rx2.id,
      createdAt: daysAgo(4),
      items: {
        create: [
          {
            productId: prodMetformin.id,
            productName: 'Metformin 500mg',
            quantity: 1,
            unitPrice: 9.99,
            subtotal: 9.99,
            requiresRx: true,
            dispensedQty: 60,
          },
          {
            productId: prodGlucoseMeter.id,
            productName: 'Glucose Meter',
            quantity: 1,
            unitPrice: 34.99,
            subtotal: 34.99,
            requiresRx: false,
          },
          {
            productId: prodPillOrganizer.id,
            productName: 'Pill Organizer',
            quantity: 2,
            unitPrice: 6.49,
            subtotal: 12.99,
            requiresRx: false,
          },
        ],
      },
    },
  })

  const txn4 = await db.transaction.create({
    data: {
      transactionNo: 'TXN-20240727-0004',
      customerId: customer5.id,
      userId: cashier.id,
      subtotal: 44.97,
      tax: 0,
      discount: 0,
      total: 44.97,
      paymentMethod: 'DEBIT_CARD',
      paymentAmount: 44.97,
      changeAmount: 0,
      status: 'COMPLETED',
      createdAt: daysAgo(3),
      items: {
        create: [
          {
            productId: prodLoratadine.id,
            productName: 'Loratadine 10mg',
            quantity: 1,
            unitPrice: 12.99,
            subtotal: 12.99,
            requiresRx: false,
          },
          {
            productId: prodOmeprazole.id,
            productName: 'Omeprazole 20mg',
            quantity: 1,
            unitPrice: 14.99,
            subtotal: 14.99,
            requiresRx: false,
          },
          {
            productId: prodMultivitamin.id,
            productName: 'Multivitamin',
            quantity: 1,
            unitPrice: 16.99,
            subtotal: 16.99,
            requiresRx: false,
          },
        ],
      },
    },
  })

  const txn5 = await db.transaction.create({
    data: {
      transactionNo: 'TXN-20240728-0005',
      customerId: customer6.id,
      userId: clerk.id,
      subtotal: 27.47,
      tax: 0,
      discount: 0,
      total: 27.47,
      paymentMethod: 'CREDIT_CARD',
      paymentAmount: 27.47,
      changeAmount: 0,
      status: 'COMPLETED',
      createdAt: daysAgo(2),
      items: {
        create: [
          {
            productId: prodNaproxen.id,
            productName: 'Naproxen Sodium 220mg',
            quantity: 1,
            unitPrice: 9.49,
            subtotal: 9.49,
            requiresRx: false,
          },
          {
            productId: prodCalcium.id,
            productName: 'Calcium 600mg',
            quantity: 1,
            unitPrice: 10.99,
            subtotal: 10.99,
            requiresRx: false,
          },
          {
            productId: prodHandSanitizer.id,
            productName: 'Hand Sanitizer',
            quantity: 1,
            unitPrice: 4.99,
            subtotal: 4.99,
            requiresRx: false,
          },
        ],
      },
    },
  })

  const txn6 = await db.transaction.create({
    data: {
      transactionNo: 'TXN-20240729-0006',
      customerId: customer4.id,
      userId: clerk.id,
      subtotal: 147.94,
      tax: 0,
      discount: 0,
      total: 147.94,
      paymentMethod: 'CREDIT_CARD',
      paymentAmount: 147.94,
      changeAmount: 0,
      status: 'COMPLETED',
      createdAt: daysAgo(1),
      items: {
        create: [
          {
            productId: prodBPMonitor.id,
            productName: 'Blood Pressure Monitor',
            quantity: 1,
            unitPrice: 49.99,
            subtotal: 49.99,
            requiresRx: false,
          },
          {
            productId: prodPulseOximeter.id,
            productName: 'Pulse Oximeter',
            quantity: 1,
            unitPrice: 29.99,
            subtotal: 29.99,
            requiresRx: false,
          },
          {
            productId: prodVitaminD.id,
            productName: 'Vitamin D3 1000IU',
            quantity: 2,
            unitPrice: 14.99,
            subtotal: 29.98,
            requiresRx: false,
          },
          {
            productId: prodSunscreen.id,
            productName: 'Sunscreen SPF50',
            quantity: 1,
            unitPrice: 12.49,
            subtotal: 12.49,
            requiresRx: false,
          },
          {
            productId: prodRxBags.id,
            productName: 'Prescription Bags',
            quantity: 1,
            unitPrice: 24.99,
            subtotal: 24.99,
            requiresRx: false,
          },
        ],
      },
    },
  })

  const txn7 = await db.transaction.create({
    data: {
      transactionNo: 'TXN-20240730-0007',
      customerId: customer8.id,
      userId: cashier.id,
      subtotal: 16.98,
      tax: 0,
      discount: 0,
      total: 16.98,
      paymentMethod: 'CASH',
      paymentAmount: 20.00,
      changeAmount: 3.02,
      status: 'COMPLETED',
      createdAt: daysAgo(0),
      items: {
        create: [
          {
            productId: prodIbuprofen.id,
            productName: 'Ibuprofen 200mg',
            quantity: 1,
            unitPrice: 8.99,
            subtotal: 8.99,
            requiresRx: false,
          },
          {
            productId: prodBandAid.id,
            productName: 'Band-Aid Variety Pack',
            quantity: 1,
            unitPrice: 6.99,
            subtotal: 6.99,
            requiresRx: false,
          },
        ],
      },
    },
  })

  const txn8 = await db.transaction.create({
    data: {
      transactionNo: 'TXN-20240730-0008',
      customerId: customer7.id,
      userId: pharmacist.id,
      subtotal: 45.98,
      tax: 0,
      discount: 0,
      total: 45.98,
      paymentMethod: 'INSURANCE',
      paymentAmount: 45.98,
      changeAmount: 0,
      status: 'COMPLETED',
      prescriptionId: rx4.id,
      createdAt: daysAgo(0),
      items: {
        create: [
          {
            productId: prodAtorvastatin.id,
            productName: 'Atorvastatin 20mg',
            quantity: 1,
            unitPrice: 18.99,
            subtotal: 18.99,
            requiresRx: true,
            dispensedQty: 30,
          },
          {
            productId: prodLevothyroxine.id,
            productName: 'Levothyroxine 50mcg',
            quantity: 1,
            unitPrice: 11.99,
            subtotal: 11.99,
            requiresRx: true,
            dispensedQty: 30,
          },
          {
            productId: prodVitaminB12.id,
            productName: 'Vitamin B12 500mcg',
            quantity: 1,
            unitPrice: 8.49,
            subtotal: 8.49,
            requiresRx: false,
          },
          {
            productId: prodFishOil.id,
            productName: 'Fish Oil 1000mg',
            quantity: 1,
            unitPrice: 19.99,
            subtotal: 19.99,
            requiresRx: false,
          },
        ],
      },
    },
  })

  const txn9 = await db.transaction.create({
    data: {
      transactionNo: 'TXN-20240724-0009',
      customerId: customer3.id,
      userId: cashier.id,
      subtotal: 34.97,
      tax: 0,
      discount: 0,
      total: 34.97,
      paymentMethod: 'FSA_HSA',
      paymentAmount: 34.97,
      changeAmount: 0,
      status: 'COMPLETED',
      createdAt: daysAgo(7),
      items: {
        create: [
          {
            productId: prodVitaminD.id,
            productName: 'Vitamin D3 1000IU',
            quantity: 1,
            unitPrice: 14.99,
            subtotal: 14.99,
            requiresRx: false,
          },
          {
            productId: prodCalcium.id,
            productName: 'Calcium 600mg',
            quantity: 1,
            unitPrice: 10.99,
            subtotal: 10.99,
            requiresRx: false,
          },
          {
            productId: prodMedicineCups.id,
            productName: 'Medicine Cups',
            quantity: 1,
            unitPrice: 11.99,
            subtotal: 11.99,
            requiresRx: false,
          },
        ],
      },
    },
  })

  const txn10 = await db.transaction.create({
    data: {
      transactionNo: 'TXN-20240726-0010',
      customerId: customer1.id,
      userId: technician.id,
      subtotal: 22.48,
      tax: 0,
      discount: 0,
      total: 22.48,
      paymentMethod: 'SPLIT',
      paymentAmount: 22.48,
      changeAmount: 0,
      status: 'COMPLETED',
      createdAt: daysAgo(4),
      notes: 'Split: $10 cash, $12.49 debit card',
      items: {
        create: [
          {
            productId: prodAcetaminophen.id,
            productName: 'Acetaminophen 500mg',
            quantity: 1,
            unitPrice: 7.49,
            subtotal: 7.49,
            requiresRx: false,
          },
          {
            productId: prodLoratadine.id,
            productName: 'Loratadine 10mg',
            quantity: 1,
            unitPrice: 12.99,
            subtotal: 12.99,
            requiresRx: false,
          },
        ],
      },
    },
  })

  console.log('  ✅ 10 transactions created')

  // ============ HARDWARE LOGS ============
  console.log('  Creating hardware logs...')

  await db.hardwareLog.create({
    data: {
      transactionId: txn1.id,
      hardwareType: 'receipt_printer',
      action: 'RECEIPT_PRINTED',
      status: 'success',
      details: JSON.stringify({
        printerModel: 'Epson TM-T88VI',
        paperSize: '80mm',
        copies: 1,
        printDuration: '2.3s',
      }),
      createdAt: txn1.createdAt,
    },
  })

  await db.hardwareLog.create({
    data: {
      transactionId: txn6.id,
      hardwareType: 'receipt_printer',
      action: 'RECEIPT_PRINTED',
      status: 'success',
      details: JSON.stringify({
        printerModel: 'Epson TM-T88VI',
        paperSize: '80mm',
        copies: 1,
        printDuration: '3.1s',
      }),
      createdAt: txn6.createdAt,
    },
  })

  await db.hardwareLog.create({
    data: {
      hardwareType: 'barcode_scanner',
      action: 'BARCODE_SCANNED',
      status: 'success',
      details: JSON.stringify({
        scannerModel: 'Honeywell Voyager 1200g',
        barcodeFormat: 'EAN-13',
        barcodeValue: '0002123400069',
        scanDuration: '0.4s',
      }),
      createdAt: daysAgo(0),
    },
  })

  console.log('  ✅ 3 hardware logs created')

  console.log('')
  console.log('🎉 Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
