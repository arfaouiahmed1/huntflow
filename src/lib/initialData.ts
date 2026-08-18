import { JobApplication, UserProfile } from '../types';
import { seedJobs } from './seedData';

export const initialProfile: UserProfile = {
  name: 'Ahmed Arfaoui',
  email: 'ahmedarfaoui2000@gmail.com',
  phone: '+216 58 732 642',
  location: 'Tunis, Tunisia',
  address: 'Avenue Habib Bourguiba',
  city: 'Tunis',
  state: 'Tunis',
  postalCode: '1000',
  country: 'Tunisia',
  targetTitle: 'AI Engineer (New Graduate)',
  summary: 'AI engineer specializing in agentic systems, GenAI pipelines, and machine learning. Built production LLM workflows (RAG, tool-calling agents, MLOps) across internships and personal projects; experienced in Python, TypeScript, and end-to-end deployment.',
  headline: 'AI Engineer — Agentic systems, GenAI, ML',
  linkedin: 'https://linkedin.com/in/ahmed-arfaoui',
  github: 'https://github.com/ahmedarfaoui',
  portfolio: 'https://ahmedarfaoui.dev',
  citizenship: 'Tunisia',
  workPermitStatus: 'authorized',
  desiredSalary: '$85,000 - $110,000 USD',
  noticePeriod: 'Immediate',
  yearsOfExperience: 2,
  willingnessToRelocate: 'yes',
  preferredWorkMode: 'hybrid',
  skills: [
    'Python', 'TypeScript', 'FastAPI', 'LangGraph', 'LangChain', 'RAG',
    'LLM Evaluation', 'Prompt Engineering', 'React', 'Next.js', 'Node.js',
    'Machine Learning', 'YOLOv8', 'ResNet', 'ARIMA', 'SARIMAX', 'Prophet',
    'Power BI', 'MLflow', 'DVC', 'Docker', 'PostgreSQL', 'Azure AI',
  ],
  experience: [
    {
      id: 'exp-1',
      company: 'Open Web Catcher',
      role: 'AI Software Engineer Intern',
      duration: '2026',
      bulletPoints: [
        'Built browser-automation agents handling 126 automated runs with 97.6% tool-call success and 73.7% strict completion rate.',
        'Engineered agentic tool-use pipelines and RAG evaluation harnesses.',
      ],
    },
    {
      id: 'exp-2',
      company: 'VERMEG',
      role: 'Software Engineering Intern',
      duration: '2025',
      bulletPoints: [
        'Automated bank reporting with 50+ XML configuration profiles, reaching 90% accuracy while cutting manual effort by 95%.',
        'Developed data transformation and reporting pipelines for banking clients.',
      ],
    },
    {
      id: 'exp-3',
      company: 'CMR (Capitole du Rhône)',
      role: 'Data Analyst Intern',
      duration: '2025',
      bulletPoints: [
        'Forecasted sales with ARIMA, SARIMAX, and Prophet models; delivered interactive Power BI dashboards.',
        'Designed ETL data pipelines and KPI reporting for decision-makers.',
      ],
    },
    {
      id: 'exp-4',
      company: 'FarmWise',
      role: 'Machine Learning Project',
      duration: '2025',
      bulletPoints: [
        'Built computer vision systems with YOLOv8 reaching 88% mAP and ResNet classifiers at 95% accuracy.',
      ],
    },
  ],
  education: [
    {
      id: 'edu-1',
      degree: 'Engineering Degree — Data Engineering & AI',
      school: 'ESPRIT (École Supérieure Privée d\'Ingénierie et de Technologie)',
      year: '2026',
    },
  ],
  geminiApiKey: '',
};

export const initialJobs: JobApplication[] = seedJobs;

