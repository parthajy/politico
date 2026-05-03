// Verified Arunachal Pradesh reference data — sourced from Wikipedia
// 2024 AP Legislative Assembly election results, Fifth Pema Khandu ministry,
// and the Government of Arunachal Pradesh cabinet portal (verified 2026-05-03).
// Items that could not be verified are marked UNVERIFIED at the call site;
// rather than invent, we leave the relevant FK null.

export type SeedDistrict = {
  name: string;
  hq: string;
  population_est: number;
  tier: 1 | 2 | 3;
  dominant_communities: string[];
};

export type SeedConstituency = {
  number: number;
  name: string;
  district: string;
  mla_name: string;
  party: string;
  last_election_margin_pct: number | null;
};

export type SeedCabinet = {
  name: string;
  constituency: string | null; // null if unverified
  portfolio: string;
  is_cm: boolean;
  is_deputy_cm: boolean;
};

export const DISTRICTS: SeedDistrict[] = [
  { name: "Tawang", hq: "Tawang", population_est: 49977, tier: 1, dominant_communities: ["Monpa"] },
  { name: "West Kameng", hq: "Bomdila", population_est: 87013, tier: 1, dominant_communities: ["Monpa", "Sherdukpen", "Aka", "Bugun"] },
  { name: "Bichom", hq: "Napangphung", population_est: 9710, tier: 3, dominant_communities: ["Aka", "Bugun", "Miji"] },
  { name: "East Kameng", hq: "Seppa", population_est: 78413, tier: 2, dominant_communities: ["Nyishi", "Puroik"] },
  { name: "Pakke-Kessang", hq: "Lemmi", population_est: 22000, tier: 3, dominant_communities: ["Nyishi"] },
  { name: "Papum Pare", hq: "Yupia", population_est: 176385, tier: 1, dominant_communities: ["Nyishi"] },
  { name: "Itanagar Capital Complex", hq: "Itanagar", population_est: 60000, tier: 1, dominant_communities: ["Nyishi", "mixed urban tribes"] },
  { name: "Kurung Kumey", hq: "Koloriang", population_est: 89717, tier: 2, dominant_communities: ["Nyishi"] },
  { name: "Kra Daadi", hq: "Jamin", population_est: 22290, tier: 3, dominant_communities: ["Nyishi"] },
  { name: "Lower Subansiri", hq: "Ziro", population_est: 82839, tier: 1, dominant_communities: ["Apatani", "Nyishi"] },
  { name: "Keyi Panyor", hq: "Yachuli", population_est: 30000, tier: 3, dominant_communities: ["Nyishi"] },
  { name: "Kamle", hq: "Raga", population_est: 22256, tier: 3, dominant_communities: ["Nyishi", "Tagin"] },
  { name: "Upper Subansiri", hq: "Daporijo", population_est: 83205, tier: 2, dominant_communities: ["Tagin", "Galo", "Nyishi"] },
  { name: "West Siang", hq: "Aalo", population_est: 112272, tier: 2, dominant_communities: ["Galo", "Adi"] },
  { name: "Lepa-Rada", hq: "Basar", population_est: 30000, tier: 3, dominant_communities: ["Galo"] },
  { name: "Lower Siang", hq: "Likabali", population_est: 80597, tier: 3, dominant_communities: ["Galo", "Adi"] },
  { name: "Shi-Yomi", hq: "Tato", population_est: 13310, tier: 3, dominant_communities: ["Memba", "Tagin", "Galo"] },
  { name: "Siang", hq: "Boleng", population_est: 31920, tier: 3, dominant_communities: ["Adi"] },
  { name: "East Siang", hq: "Pasighat", population_est: 99019, tier: 1, dominant_communities: ["Adi"] },
  { name: "Upper Siang", hq: "Yingkiong", population_est: 33146, tier: 2, dominant_communities: ["Adi"] },
  { name: "Dibang Valley", hq: "Anini", population_est: 7948, tier: 3, dominant_communities: ["Idu Mishmi"] },
  { name: "Lower Dibang Valley", hq: "Roing", population_est: 53986, tier: 2, dominant_communities: ["Idu Mishmi", "Adi"] },
  { name: "Lohit", hq: "Tezu", population_est: 145538, tier: 2, dominant_communities: ["Mishmi", "Khampti"] },
  { name: "Anjaw", hq: "Hawai", population_est: 21089, tier: 3, dominant_communities: ["Mishmi (Miju, Digaru)"] },
  { name: "Namsai", hq: "Namsai", population_est: 95950, tier: 2, dominant_communities: ["Tai-Khamti", "Singpho"] },
  { name: "Changlang", hq: "Changlang", population_est: 147951, tier: 1, dominant_communities: ["Tangsa", "Nocte", "Tutsa", "Singpho"] },
  { name: "Tirap", hq: "Khonsa", population_est: 111975, tier: 2, dominant_communities: ["Nocte", "Wancho"] },
  { name: "Longding", hq: "Longding", population_est: 60000, tier: 3, dominant_communities: ["Wancho"] },
];

export const CONSTITUENCIES: SeedConstituency[] = [
  { number: 1, name: "Lumla (ST)", district: "Tawang", mla_name: "Tsering Lhamu", party: "BJP", last_election_margin_pct: 17.77 },
  { number: 2, name: "Tawang (ST)", district: "Tawang", mla_name: "Namgey Tsering", party: "NPP", last_election_margin_pct: 11.87 },
  { number: 3, name: "Mukto (ST)", district: "Tawang", mla_name: "Pema Khandu", party: "BJP", last_election_margin_pct: null },
  { number: 4, name: "Dirang (ST)", district: "West Kameng", mla_name: "Phurpa Tsering", party: "BJP", last_election_margin_pct: 9.75 },
  { number: 5, name: "Kalaktang (ST)", district: "West Kameng", mla_name: "Tseten Chombay Kee", party: "BJP", last_election_margin_pct: 29.94 },
  { number: 6, name: "Thrizino-Buragaon (ST)", district: "West Kameng", mla_name: "Tenzin Nyima Glow", party: "IND", last_election_margin_pct: 3.67 },
  { number: 7, name: "Bomdila (ST)", district: "West Kameng", mla_name: "Dongru Siongju", party: "BJP", last_election_margin_pct: null },
  { number: 8, name: "Bameng (ST)", district: "East Kameng", mla_name: "Kumar Waii", party: "INC", last_election_margin_pct: 5.08 },
  { number: 9, name: "Chayangtajo (ST)", district: "East Kameng", mla_name: "Hayeng Mangfi", party: "BJP", last_election_margin_pct: 60.98 },
  { number: 10, name: "Seppa East (ST)", district: "East Kameng", mla_name: "Ealing Tallang", party: "BJP", last_election_margin_pct: 60.41 },
  { number: 11, name: "Seppa West (ST)", district: "East Kameng", mla_name: "Mama Natung", party: "BJP", last_election_margin_pct: 16.39 },
  { number: 12, name: "Pakke-Kessang (ST)", district: "Pakke-Kessang", mla_name: "Biyuram Wahge", party: "BJP", last_election_margin_pct: 9.82 },
  { number: 13, name: "Itanagar", district: "Papum Pare", mla_name: "Techi Kaso", party: "BJP", last_election_margin_pct: null },
  { number: 14, name: "Doimukh (ST)", district: "Papum Pare", mla_name: "Nabam Vivek", party: "PPA", last_election_margin_pct: 12.08 },
  { number: 15, name: "Sagalee (ST)", district: "Papum Pare", mla_name: "Ratu Techi", party: "BJP", last_election_margin_pct: null },
  { number: 16, name: "Yachuli (ST)", district: "Keyi Panyor", mla_name: "Toko Tatung", party: "NCP", last_election_margin_pct: 1.40 },
  { number: 17, name: "Ziro-Hapoli (ST)", district: "Lower Subansiri", mla_name: "Hage Appa", party: "BJP", last_election_margin_pct: null },
  { number: 18, name: "Palin (ST)", district: "Kra Daadi", mla_name: "Balo Raja", party: "BJP", last_election_margin_pct: 32.76 },
  { number: 19, name: "Nyapin (ST)", district: "Kurung Kumey", mla_name: "Tai Nikio", party: "BJP", last_election_margin_pct: 8.09 },
  { number: 20, name: "Tali (ST)", district: "Kra Daadi", mla_name: "Jikke Tako", party: "BJP", last_election_margin_pct: null },
  { number: 21, name: "Koloriang (ST)", district: "Kurung Kumey", mla_name: "Pani Taram", party: "BJP", last_election_margin_pct: 82.38 },
  { number: 22, name: "Nacho (ST)", district: "Upper Subansiri", mla_name: "Nakap Nalo", party: "BJP", last_election_margin_pct: 14.47 },
  { number: 23, name: "Taliha (ST)", district: "Upper Subansiri", mla_name: "Nyato Rigia", party: "BJP", last_election_margin_pct: null },
  { number: 24, name: "Daporijo (ST)", district: "Upper Subansiri", mla_name: "Taniya Soki", party: "BJP", last_election_margin_pct: 1.70 },
  { number: 25, name: "Raga (ST)", district: "Kamle", mla_name: "Rotom Tebin", party: "BJP", last_election_margin_pct: 20.00 },
  { number: 26, name: "Dumporijo (ST)", district: "Upper Subansiri", mla_name: "Rode Bui", party: "BJP", last_election_margin_pct: 14.17 },
  { number: 27, name: "Liromoba (ST)", district: "West Siang", mla_name: "Pesi Jilen", party: "NPP", last_election_margin_pct: 13.33 },
  { number: 28, name: "Likabali (ST)", district: "Lower Siang", mla_name: "Kardo Nyigyor", party: "BJP", last_election_margin_pct: 24.45 },
  { number: 29, name: "Basar (ST)", district: "Lepa-Rada", mla_name: "Nyabi Jini Dirchi", party: "BJP", last_election_margin_pct: 10.79 },
  { number: 30, name: "Along West (ST)", district: "West Siang", mla_name: "Topin Ete", party: "BJP", last_election_margin_pct: 14.60 },
  { number: 31, name: "Along East (ST)", district: "West Siang", mla_name: "Kento Jini", party: "BJP", last_election_margin_pct: 27.12 },
  { number: 32, name: "Rumgong (ST)", district: "Siang", mla_name: "Talem Taboh", party: "BJP", last_election_margin_pct: 10.59 },
  { number: 33, name: "Mechuka (ST)", district: "Shi-Yomi", mla_name: "Pasang Dorjee Sona", party: "BJP", last_election_margin_pct: 25.26 },
  { number: 34, name: "Tuting-Yingkiong (ST)", district: "Upper Siang", mla_name: "Alo Libang", party: "BJP", last_election_margin_pct: 8.07 },
  { number: 35, name: "Pangin (ST)", district: "Siang", mla_name: "Ojing Tasing", party: "BJP", last_election_margin_pct: 20.37 },
  { number: 36, name: "Nari-Koyu (ST)", district: "Lower Siang", mla_name: "Tojir Kadu", party: "BJP", last_election_margin_pct: 21.98 },
  { number: 37, name: "Pasighat West (ST)", district: "East Siang", mla_name: "Ninong Ering", party: "BJP", last_election_margin_pct: 21.22 },
  { number: 38, name: "Pasighat East (ST)", district: "East Siang", mla_name: "Tapi Darang", party: "NPP", last_election_margin_pct: 1.78 },
  { number: 39, name: "Mebo (ST)", district: "East Siang", mla_name: "Oken Tayeng", party: "PPA", last_election_margin_pct: 8.70 },
  { number: 40, name: "Mariyang-Geku (ST)", district: "Upper Siang", mla_name: "Oni Panyang", party: "NPP", last_election_margin_pct: 5.81 },
  { number: 41, name: "Anini (ST)", district: "Dibang Valley", mla_name: "Mopi Mihu", party: "BJP", last_election_margin_pct: 27.53 },
  { number: 42, name: "Dambuk (ST)", district: "Lower Dibang Valley", mla_name: "Puinnyo Apum", party: "BJP", last_election_margin_pct: 1.82 },
  { number: 43, name: "Roing (ST)", district: "Lower Dibang Valley", mla_name: "Mutchu Mithi", party: "BJP", last_election_margin_pct: null },
  { number: 44, name: "Tezu (ST)", district: "Lohit", mla_name: "Mahesh Chai", party: "BJP", last_election_margin_pct: 16.99 },
  { number: 45, name: "Hayuliang (ST)", district: "Anjaw", mla_name: "Dasanglu Pul", party: "BJP", last_election_margin_pct: null },
  { number: 46, name: "Chowkham (ST)", district: "Namsai", mla_name: "Chowna Mein", party: "BJP", last_election_margin_pct: null },
  { number: 47, name: "Namsai", district: "Namsai", mla_name: "Zingnu Namchoom", party: "BJP", last_election_margin_pct: 40.53 },
  { number: 48, name: "Lekang", district: "Namsai", mla_name: "Likha Soni", party: "NCP", last_election_margin_pct: 3.79 },
  { number: 49, name: "Bordumsa-Diyun", district: "Changlang", mla_name: "Nikh Kamin", party: "NCP", last_election_margin_pct: 6.58 },
  { number: 50, name: "Miao (ST)", district: "Changlang", mla_name: "Kamlung Mossang", party: "BJP", last_election_margin_pct: 16.35 },
  { number: 51, name: "Nampong (ST)", district: "Changlang", mla_name: "Laisam Simai", party: "IND", last_election_margin_pct: 0.77 },
  { number: 52, name: "Changlang South (ST)", district: "Changlang", mla_name: "Hamjongh Tangha", party: "BJP", last_election_margin_pct: 25.08 },
  { number: 53, name: "Changlang North (ST)", district: "Changlang", mla_name: "Tesam Pongte", party: "BJP", last_election_margin_pct: 22.93 },
  { number: 54, name: "Namsang (ST)", district: "Tirap", mla_name: "Wangki Lowang", party: "BJP", last_election_margin_pct: 0.73 },
  { number: 55, name: "Khonsa East (ST)", district: "Tirap", mla_name: "Wanglam Sawin", party: "IND", last_election_margin_pct: 27.22 },
  { number: 56, name: "Khonsa West (ST)", district: "Tirap", mla_name: "Chakat Aboh", party: "BJP", last_election_margin_pct: 7.88 },
  { number: 57, name: "Borduria-Bogapani (ST)", district: "Tirap", mla_name: "Wangling Lowangdong", party: "BJP", last_election_margin_pct: 17.56 },
  { number: 58, name: "Kanubari (ST)", district: "Longding", mla_name: "Gabriel Denwang Wangsu", party: "BJP", last_election_margin_pct: 17.37 },
  { number: 59, name: "Longding-Pumao (ST)", district: "Longding", mla_name: "Thangwang Wangham", party: "NPP", last_election_margin_pct: 1.27 },
  { number: 60, name: "Pongchau-Wakka (ST)", district: "Longding", mla_name: "Honchun Ngandam", party: "BJP", last_election_margin_pct: 31.71 },
];

// Fifth Pema Khandu ministry (sworn in mid-2024).
// Constituency = null where the source could not be verified — do not invent.
export const CABINET: SeedCabinet[] = [
  { name: "Pema Khandu", constituency: "Mukto (ST)", portfolio: "Chief Minister; Cabinet; General Administration; Personnel & AR; Political; Public Works; Disaster Management; Information Technology; Vigilance", is_cm: true, is_deputy_cm: false },
  { name: "Chowna Mein", constituency: "Chowkham (ST)", portfolio: "Deputy Chief Minister; Finance; Planning & Investment; Tax & Excise; State Lotteries; Power; Non-Conventional Energy", is_cm: false, is_deputy_cm: true },
  { name: "Mama Natung", constituency: "Seppa West (ST)", portfolio: "Home; Inter-State Border Affairs; Public Health Engineering & Water Supply; Indigenous Affairs", is_cm: false, is_deputy_cm: false },
  { name: "Ojing Tasing", constituency: "Pangin (ST)", portfolio: "Rural Development; Panchayati Raj; Cooperation; Transport", is_cm: false, is_deputy_cm: false },
  { name: "Kento Jini", constituency: "Along East (ST)", portfolio: "Law, Legislative & Justice; Social Justice, Empowerment & Tribal Affairs; Sports & Youth Affairs", is_cm: false, is_deputy_cm: false },
  { name: "Balo Raja", constituency: "Palin (ST)", portfolio: "Urban Affairs; Land Management; Civil Aviation", is_cm: false, is_deputy_cm: false },
  { name: "Dasanglu Pul", constituency: "Hayuliang (ST)", portfolio: "Women & Child Development; Cultural Affairs; Science & Technology", is_cm: false, is_deputy_cm: false },
  { name: "Pasang Dorjee Sona", constituency: "Mechuka (ST)", portfolio: "Education; Rural Works Department; Parliamentary Affairs; Tourism; Libraries", is_cm: false, is_deputy_cm: false },
  { name: "Gabriel Denwang Wangsu", constituency: "Kanubari (ST)", portfolio: "Agriculture; Horticulture; Animal Husbandry & Veterinary; Fisheries; Food & Civil Supplies", is_cm: false, is_deputy_cm: false },
  { name: "Wangki Lowang", constituency: "Namsang (ST)", portfolio: "Environment, Forests & Climate Change; Geology & Mining; DoTCL", is_cm: false, is_deputy_cm: false },
  { name: "Nyato Dukam", constituency: null, portfolio: "Industries; Trade & Commerce; Labour & Employment; Information & Public Relations; Skill Development", is_cm: false, is_deputy_cm: false },
  { name: "Biyuram Wahge", constituency: "Pakke-Kessang (ST)", portfolio: "Health & Family Welfare; Water Resources", is_cm: false, is_deputy_cm: false },
];

export const ISSUES: string[] = [
  "Border infrastructure & China LAC tensions",
  "All-weather road connectivity to remote circles",
  "Telecom & 4G/5G dead zones in border blocks",
  "Reliable rural electrification & small-hydro execution",
  "Primary healthcare access in roadless circles",
  "School teacher vacancies & residential-school quality",
  "Youth unemployment & outmigration from border districts",
  "Agriculture & horticulture value chains (kiwi, cardamom, oranges)",
  "Tribal welfare, customary land rights & indigenous identity",
  "Sustainable tourism in Tawang–Mechuka–Ziro–Pasighat circuits",
  "Illegal immigration & citizenship questions (Chakma–Hajong)",
  "Forest, biodiversity & watershed conservation vs hydropower",
  "Preservation of endangered tribal languages & scripts",
  "Inner Line Permit administration & land record digitisation",
  "Army-civilian coordination & disaster response",
];
