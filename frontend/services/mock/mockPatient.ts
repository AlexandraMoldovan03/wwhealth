/** DEMO DATA — fictional patient used in MOCK mode. Mirrors `GET /api/v1/patients/me`. */
import { MEDICAL_DISCLAIMER } from '@/config/config';
import type { PatientRecord } from '@/types';
import { minutesAgo } from '@/utils/format';

const DAY = 60 * 24;

export const MOCK_PATIENT: PatientRecord = {
  id: 'pat_demo_001',
  fullName: 'Maria Ionescu',
  dateOfBirth: '1991-04-17',
  sex: 'female',
  bloodType: 'A+',
  heightCm: 168,
  weightKg: 61,
  emergencyContact: { name: 'Andrei Ionescu', phone: '+40 700 000 000', relation: 'Brother' },
  allergies: [
    { id: 'al1', substance: 'Penicillin', reaction: 'Skin rash', severity: 'moderate' },
    { id: 'al2', substance: 'Pollen', reaction: 'Rhinitis', severity: 'mild' },
  ],
  diagnoses: [
    { id: 'dg1', name: 'Mild persistent asthma', icd10: 'J45.30', diagnosedAt: '2019-03-02', status: 'active' },
    { id: 'dg2', name: 'Community-acquired pneumonia', icd10: 'J18.9', diagnosedAt: '2025-01-12', status: 'resolved' },
  ],
  treatments: [
    { id: 'tr1', name: 'Budesonide inhaler', dosage: '200 mcg', frequency: '2× daily', startDate: '2019-03-02', endDate: null, active: true },
    { id: 'tr2', name: 'Amoxicillin-clavulanate', dosage: '875/125 mg', frequency: '2× daily', startDate: '2025-01-12', endDate: '2025-01-19', active: false },
  ],
  history: [
    { id: 'ev1', type: 'xray', title: 'Chest X-ray (LungVision)', description: 'Sample finding: no acute findings.', date: minutesAgo(3 * DAY), details: { Result: 'Normal', Confidence: '88%', Model: 'densenet121-demo' } },
    { id: 'ev2', type: 'document', title: 'Blood test uploaded', description: 'Complete blood count, analysed with Gemini (DEMO).', date: minutesAgo(10 * DAY), details: { Lab: 'City Lab', Flags: 'Low ferritin' } },
    { id: 'ev3', type: 'visit', title: 'Pulmonology check-up', description: 'Asthma well controlled.', date: minutesAgo(40 * DAY), details: { Doctor: 'Dr. Alex Test', Clinic: 'Sample Clinic' } },
    { id: 'ev4', type: 'diagnosis', title: 'Pneumonia (resolved)', description: 'Right lower lobe pneumonia, treated with antibiotics.', date: '2025-01-12T09:00:00.000Z', details: { ICD10: 'J18.9', Status: 'Resolved' } },
    { id: 'ev5', type: 'allergy', title: 'Penicillin allergy recorded', description: 'Skin rash after penicillin.', date: '2018-06-20T09:00:00.000Z', details: { Severity: 'Moderate' } },
  ],
  documents: [
    {
      id: 'doc1',
      title: 'Complete blood count',
      type: 'lab_result',
      uploadedAt: minutesAgo(10 * DAY),
      fileUrl: null,
      status: 'analyzed',
      isDemo: true,
      extraction: {
        summary: 'Mostly normal values; ferritin slightly below range.',
        diagnoses: [],
        allergies: [],
        medications: [],
        labValues: [
          { name: 'Hemoglobin', value: '12.9', unit: 'g/dL', flag: 'normal' },
          { name: 'Ferritin', value: '11', unit: 'ng/mL', flag: 'low' },
          { name: 'WBC', value: '6.8', unit: '10^3/µL', flag: 'normal' },
        ],
      },
    },
    {
      id: 'doc2',
      title: 'Discharge summary — pneumonia',
      type: 'discharge_summary',
      uploadedAt: '2025-01-20T10:00:00.000Z',
      fileUrl: null,
      status: 'analyzed',
      isDemo: true,
      extraction: {
        summary: 'Hospitalised 3 days for community-acquired pneumonia; discharged on oral antibiotics.',
        diagnoses: ['Community-acquired pneumonia'],
        allergies: ['Penicillin'],
        medications: ['Amoxicillin-clavulanate'],
        labValues: [],
      },
    },
  ],
  xrays: [
    {
      id: 'xr1',
      createdAt: minutesAgo(3 * DAY),
      imageUrl: null,
      heatmapUrl: null,
      predictions: [
        { label: 'Normal', probability: 0.88 },
        { label: 'Pneumonia', probability: 0.07 },
        { label: 'Effusion', probability: 0.03 },
        { label: 'Cardiomegaly', probability: 0.02 },
      ],
      topLabel: 'Normal',
      modelVersion: 'densenet121-demo',
      processingTimeMs: 1240,
      isDemo: true,
      disclaimer: MEDICAL_DISCLAIMER,
    },
  ],
};

