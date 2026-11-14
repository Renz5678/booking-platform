export interface QuoteItem {
  text: string;
  author: string;
}

export interface FeaturedCounselor {
  id: string;
  name: string;
  title: string;
  credential: string;
  specializations: string[];
  bio: string;
  rate?: number;
  photo_url?: string | null;
  isLive?: boolean;
}

export const site = {
  name: "Alaga",
  tagline: "Online counseling in the Philippines",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://alaga.ph",
  description:
    "Confidential 1-on-1 online therapy with PRC-licensed Filipino counselors and psychologists, scheduled in Philippine Time.",
  hotline: "1553",
  email: "care@alaga.ph",
  privacyLaw: "RA 10173",
};

export const defaultQuotes: QuoteItem[] = [
  {
    text: "Healing is not linear, and you do not have to carry everything on your own. Taking the first step to talk is already an act of courage.",
    author: "Alaga Clinical Team",
  },
  {
    text: "A safe, confidential room allows you to slow down, untangle your thoughts, and rebuild clarity at your own pace.",
    author: "Alaga Guidance & Counseling Team",
  },
  {
    text: "Care that respects your culture, your language, and your privacy, from wherever you feel most at ease.",
    author: "Alaga Counseling Care",
  },
];

export const careSteps = [
  {
    index: "01",
    title: "Read profiles without the noise",
    body: "Filter PRC-licensed psychologists and guidance counselors by focus area, clinical approach, and hourly rate before you commit to a call.",
    detail: "Verified PRC credentials",
  },
  {
    index: "02",
    title: "Pick an open hour in Manila Time",
    body: "Sign in to view live weekly slots in UTC+8, select a 60-minute window that fits your day, and share brief intake notes privately.",
    detail: "Live UTC+8 availability",
  },
  {
    index: "03",
    title: "Confirm and meet one-on-one",
    body: "Upload your payment proof, receive confirmation directly from your practitioner, and join your private video room at your scheduled hour.",
    detail: "Encrypted 1-on-1 sessions",
  },
];

export const trustCommitments = [
  {
    label: "Confidentiality",
    title: "Private intake notes",
    body: "Intake forms and session notes remain strictly between you and your counselor under Philippine Data Privacy Act (RA 10173) standards.",
  },
  {
    label: "Flexibility",
    title: "Direct rescheduling",
    body: "When work or family plans shift, reschedule directly from your client dashboard without chasing support tickets.",
  },
  {
    label: "Verification",
    title: "Active PRC licenses",
    body: "Every practitioner submits active Professional Regulation Commission documentation reviewed by our clinical team.",
  },
  {
    label: "Human Desk",
    title: "Real support when stuck",
    body: "Need help choosing a focus area or verifying a payment receipt? Message our care desk anytime.",
  },
];

// Curated fallback practitioners shown only when the backend API is unreachable
// or no live counselor profiles are returned yet. Leave photo_url as null until
// real portraits are added (profile cards reserve space for pictures).
export const fallbackCounselors: FeaturedCounselor[] = [
  {
    id: "featured-1",
    name: "Dr. Princess Lara V. Gaganao",
    title: "Licensed Guidance Counselor & Values Education Teacher",
    credential: "RGC",
    specializations: [
      "Personal & Academic Growth",
      "Career Development",
      "Values & Resilience",
    ],
    bio: "Licensed Guidance Counselor, Values Education Teacher, Mental Health Advocate, and Career Development Advocate passionate about guiding learners in their personal, academic, and career growth while promoting positive values, resilience, and holistic development to help students become responsible, confident, and future-ready.",
    photo_url: null,
    isLive: false,
  },
  {
    id: "featured-2",
    name: "Sir Danree De Gula",
    title: "Teacher III & Certified Career Guidance Advocate",
    credential: "LPT, MAEd, RGC",
    specializations: [
      "Career Guidance",
      "Personal & Social Development",
      "Academic Growth",
    ],
    bio: "Teacher III at Gen. T. De Leon National High School and Certified Career Guidance Advocate championing Personal, Academic, Career, and Social Development—equipping students with life skills, decision-making tools, and career pathways in a safe, supportive space where no learner is left behind.",
    photo_url: null,
    isLive: false,
  },
  {
    id: "featured-3",
    name: "Dr. Jasmin Gacutan-Santos",
    title: "Instructor & University Counselor, PSAU",
    credential: "RGC, LPT",
    specializations: [
      "Mental Wellness",
      "Student Empowerment",
      "Academic Counseling",
    ],
    bio: "Licensed Guidance Counselor, Mental Health Advocate, and Licensed Professional Teacher serving as Instructor and University Counselor at Pampanga State Agricultural University—committed to creating safe, supportive, and empowering learning environments that inspire lifelong learning and help students reach their fullest potential.",
    photo_url: null,
    isLive: false,
  },
];
