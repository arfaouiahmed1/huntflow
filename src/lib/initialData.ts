import { JobApplication, UserProfile } from '../types';

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

export const initialJobs: JobApplication[] = [
  {
    id: 'job-1',
    title: 'Senior Frontend Engineer',
    company: 'Vercel',
    location: 'Remote (US/EU)',
    salary: '$160,000 - $190,000',
    url: 'https://vercel.com/careers/senior-frontend-engineer',
    status: 'interviewing',
    appliedDate: '2026-07-15',
    deadline: '2026-08-10',
    companyLogo: 'https://avatar.vercel.sh/vercel.svg',
    createdDate: '2026-07-14',
    jobDescription: `We are looking for a Senior Frontend Engineer to build world-class user experiences for Vercel's Edge platform.
Requirements:
- 5+ years of production React and Next.js experience.
- Deep understanding of Web Vitals, Performance, Server Components, and SSR.
- Strong TypeScript mastery and CSS architecture (Tailwind CSS preferred).
- Experience with real-time UI, state management, and edge infrastructure.
- Great product eye and obsession with micro-interactions.`,
    notes: 'Technical screening passed! System design interview scheduled for Thursday.',
    matchScore: 92,
    skillsGap: {
      matchScore: 92,
      matchingSkills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Node.js', 'Performance Optimization'],
      missingSkills: ['Edge Runtime / Cloudflare Workers', 'Turbopack internals'],
      strengths: ['Deep Next.js experience', 'Strong TypeScript skills', 'Proven UI performance record'],
      recommendations: [
        'Highlight Next.js App Router and Server Actions in resume bullet points.',
        'Prepare to answer Edge Runtime vs Node.js runtime memory limits.',
        'Mention experience optimizing Next.js Core Web Vitals.'
      ],
      keyTermFrequency: [
        { term: 'Next.js', count: 8, inResume: true },
        { term: 'TypeScript', count: 6, inResume: true },
        { term: 'Performance', count: 5, inResume: true },
        { term: 'Edge', count: 4, inResume: false }
      ]
    },
    documents: {
      tailoredResume: `AHMED ARFAOUI | Senior Full Stack Software Engineer
ahmed.arfaoui@example.com | San Francisco, CA | linkedin.com/in/ahmedarfaoui

SUMMARY
Production-tested Senior Engineer with 6+ years specializing in Next.js, React, and TypeScript. Expert in building high-performance server-rendered web platforms and edge integrations.

HIGHLIGHTED EXPERIENCE
Senior Frontend / Full Stack Engineer @ TechPulse Solutions (2022 - Present)
• Engineered Next.js App Router infrastructure handling 150k monthly active users with 99.9% uptime.
• Reduced Largest Contentful Paint (LCP) by 42% through image optimization, dynamic imports, and edge caching.
• Built Gemini AI agent integrations for automated workflows.`,
      coverLetter: `Dear Hiring Team at Vercel,

I am writing to express my enthusiastic interest in the Senior Frontend Engineer position. Having relied on Vercel's ecosystem for years to build high-performance web applications, the opportunity to contribute directly to the platform is deeply compelling to me.

Over the past 6 years, I have specialized in Next.js, React, and TypeScript. At TechPulse Solutions, I led the architecture of our Next.js web platform, optimizing Core Web Vitals and cutting LCP by 42%. My focus aligns seamlessly with Vercel's standard for speed, simplicity, and developer experience.

Thank you for your time and consideration. I look forward to discussing how my frontend expertise can add value to Vercel.

Best regards,
Ahmed Arfaoui`,
      motivationLetter: `Motivation Letter for Vercel:

My passion for developer tooling and web performance makes Vercel my top target company. Vercel transformed how developers deploy and scale web applications, and I want to be part of building the next generation of web interfaces.`
    },
    starFlashcards: [
      {
        id: 'star-1',
        question: 'Describe a time you solved a complex Next.js performance bottleneck.',
        situation: 'Our dashboard page load time degraded to 4.2 seconds as dataset size grew at TechPulse.',
        task: 'I was assigned to audit Core Web Vitals and reduce LCP under 1.8 seconds without dropping features.',
        action: 'I migrated heavy components to Next.js Server Components, implemented streaming SSR with Suspense, and lazy-loaded interactive charts.',
        result: 'Reduced LCP by 42% (down to 1.4s), boosted Lighthouse performance score from 61 to 98, and improved user conversion by 14%.',
        difficulty: 'medium',
        status: 'mastered'
      },
      {
        id: 'star-2',
        question: 'How do you handle architectural disagreements regarding state management?',
        situation: 'Two senior team members were locked in debate between Redux Toolkit and Zustand for a new project.',
        task: 'As tech lead, I needed to resolve the deadlock and select the optimal state solution for our Next.js app.',
        action: 'I facilitated a lightweight benchmark spike testing both on real user workflows and evaluated bundle size impact.',
        result: 'The team unanimously selected Zustand, saving 18kB in client bundle size and accelerating dev onboarding speed.',
        difficulty: 'easy',
        status: 'learning'
      }
    ],
    autoApplyStatus: 'applied',
    autoApplyLogs: [
      { timestamp: '2026-07-15 10:00:01', message: 'Scrapling Agent initiated application for Vercel', type: 'info' },
      { timestamp: '2026-07-15 10:00:03', message: 'Parsed application form fields: Full Name, Email, LinkedIn, Resume PDF', type: 'info' },
      { timestamp: '2026-07-15 10:00:05', message: 'Injected tailored resume and cover letter payload', type: 'info' },
      { timestamp: '2026-07-15 10:00:08', message: 'Form submitted successfully! Confirmation code: #VCL-88291', type: 'success' }
    ]
  },
  {
    id: 'job-2',
    title: 'Full Stack AI Engineer',
    company: 'Stripe',
    location: 'San Francisco, CA / Hybrid',
    salary: '$175,000 - $210,000',
    url: 'https://stripe.com/jobs/full-stack-ai-engineer',
    status: 'applied',
    appliedDate: '2026-07-22',
    deadline: '2026-08-15',
    createdDate: '2026-07-21',
    jobDescription: `Stripe is building intelligent merchant tools. We are looking for a Full Stack Engineer to integrate Generative AI capabilities into merchant dashboards.
Qualifications:
- 4+ years software engineering experience with Node.js/TypeScript and Python.
- Proven experience building LLM pipelines or integrating AI APIs (OpenAI, Gemini, Anthropic).
- Strong foundation in REST/GraphQL API design and relational databases (Postgres).
- Ability to build clean, responsive React interfaces.`,
    notes: 'Applied via automated agent. Follow-up email scheduled in 5 days.',
    matchScore: 88,
    skillsGap: {
      matchScore: 88,
      matchingSkills: ['TypeScript', 'Node.js', 'React', 'Python', 'PostgreSQL', 'REST APIs', 'Gemini API'],
      missingSkills: ['Anthropic API', 'Vector Databases (pgvector/Pinecone)'],
      strengths: ['LLM API integration experience', 'Full stack versatility in TS & Python'],
      recommendations: [
        'Mention LLM embedding workflows or RAG in your summary.',
        'Add PostgreSQL index optimization examples.'
      ],
      keyTermFrequency: [
        { term: 'Python', count: 6, inResume: true },
        { term: 'LLM', count: 5, inResume: true },
        { term: 'Postgres', count: 4, inResume: true },
        { term: 'Vector DB', count: 3, inResume: false }
      ]
    },
    documents: {
      tailoredResume: `AHMED ARFAOUI | Full Stack AI Engineer
ahmed.arfaoui@example.com | San Francisco, CA

SUMMARY
Full Stack Engineer with expertise in React, Node.js, Python, and GenAI integrations. Built production-grade AI-powered dashboards and resilient payment/SaaS workflows.`,
      coverLetter: `Dear Stripe Engineering Team,

I am writing to express my interest in the Full Stack AI Engineer position. Having built AI-driven dashboard features and robust full-stack software, I am excited about Stripe's vision for intelligent financial tools.

Best regards,
Ahmed Arfaoui`
    },
    starFlashcards: [
      {
        id: 'star-3',
        question: 'How have you handled rate limits or errors when integrating external AI APIs?',
        situation: 'During high traffic spikes, OpenAI API calls hit rate limits, throwing 429 errors for end users.',
        task: 'Implement a resilient API gateway with exponential backoff and dynamic caching.',
        action: 'Created an async worker queue with Redis and implemented fallbacks to Gemini API when primary models timed out.',
        result: 'Achieved 99.95% AI response reliability and reduced overall API latency by 35%.',
        difficulty: 'hard',
        status: 'unstudied'
      }
    ],
    autoApplyStatus: 'applied',
    autoApplyLogs: [
      { timestamp: '2026-07-22 14:12:00', message: 'Auto-Apply job queued for Stripe', type: 'info' },
      { timestamp: '2026-07-22 14:12:04', message: 'Filled Stripe application form via Scrapling browser agent', type: 'info' },
      { timestamp: '2026-07-22 14:12:09', message: 'Application submitted! Status logged as Applied.', type: 'success' }
    ]
  },
  {
    id: 'job-3',
    title: 'Lead Software Engineer',
    company: 'Linear',
    location: 'Remote',
    salary: '$180,000 - $220,000',
    url: 'https://linear.app/careers/lead-engineer',
    status: 'wishlist',
    deadline: '2026-08-30',
    createdDate: '2026-07-28',
    jobDescription: `Linear is looking for a Lead Software Engineer to build ultra-fast collaboration tools.
Requirements:
- Deep expertise in high-performance frontend architecture (React, WebSockets, Local-first sync).
- System design mastery and experience mentoring engineering teams.
- Passion for fluid UI, micro-animations, and keyboard-first user experiences.`,
    notes: 'Drafting tailored motivation letter and reviewing STAR interview prep.',
    matchScore: 85,
    skillsGap: {
      matchScore: 85,
      matchingSkills: ['React', 'TypeScript', 'Node.js', 'System Design', 'WebSockets'],
      missingSkills: ['Local-first Sync (Replicache/ElectricSQL)', 'WASM'],
      strengths: ['UI performance and rich state design', 'Leadership experience'],
      recommendations: [
        'Study local-first architecture patterns (CRDTs / optimistic updates).',
        'Emphasize keyboard-driven shortcut implementations in past projects.'
      ],
      keyTermFrequency: [
        { term: 'React', count: 7, inResume: true },
        { term: 'Performance', count: 6, inResume: true },
        { term: 'Local-first', count: 3, inResume: false }
      ]
    },
    autoApplyStatus: 'idle',
    autoApplyLogs: []
  }
];
