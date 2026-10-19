/** Fixed name pools for seeded people (fictional combinations). */
export const FIRST_NAMES = [
  'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'Lucas', 'Isabella', 'Mason',
  'Mia', 'Ethan', 'Amelia', 'Logan', 'Harper', 'James', 'Evelyn', 'Aiden', 'Abigail', 'Daniel',
  'Emily', 'Henry', 'Ella', 'Jackson', 'Elizabeth', 'Sebastian', 'Camila', 'Mateo', 'Luna', 'Jack',
  'Sofia', 'Owen', 'Avery', 'Samuel', 'Mila', 'Leo', 'Aria', 'Julian', 'Scarlett', 'Levi',
  'Penelope', 'Isaac', 'Layla', 'Gabriel', 'Chloe', 'Anthony', 'Victoria', 'Dylan', 'Madison', 'Lincoln',
  'Eleanor', 'Thomas', 'Grace', 'Ryan', 'Nora', 'Nathan', 'Riley', 'Caleb', 'Zoey', 'Adrian',
  'Anna', 'Dmitri', 'Elena', 'Ivan', 'Maria', 'Pavel', 'Olga', 'Sergei', 'Tatiana', 'Andrei',
] as const;

export const LAST_NAMES = [
  'Anderson', 'Baker', 'Carter', 'Dawson', 'Ellis', 'Fischer', 'Garcia', 'Hughes', 'Ingram', 'Jensen',
  'Keller', 'Lambert', 'Morgan', 'Novak', 'Ortega', 'Palmer', 'Quinn', 'Reyes', 'Sullivan', 'Turner',
  'Underwood', 'Vasquez', 'Walsh', 'Young', 'Zimmerman', 'Archer', 'Bishop', 'Coleman', 'Dalton', 'Foster',
  'Grant', 'Hayes', 'Irwin', 'Jordan', 'Kirby', 'Lawson', 'Mercer', 'Nash', 'Owens', 'Porter',
  'Ramsey', 'Shaw', 'Tanner', 'Vaughn', 'Webb', 'Bennett', 'Chandler', 'Donovan', 'Everett', 'Fleming',
  'Harlow', 'Kowalski', 'Lindqvist', 'Moreau', 'Nakamura', 'Petrov', 'Sokolova', 'Volkov', 'Ivanova', 'Kuznetsov',
] as const;

export const DEPARTMENTS = ['Engineering', 'Finance', 'Sales', 'Marketing', 'Operations', 'Legal', 'HR', 'Research'] as const;

export const JOB_TITLES: Record<(typeof DEPARTMENTS)[number], readonly string[]> = {
  Engineering: ['Software Engineer', 'Senior Engineer', 'QA Engineer', 'Engineering Manager'],
  Finance: ['Accountant', 'Financial Analyst', 'Controller'],
  Sales: ['Account Executive', 'Sales Manager', 'Business Developer'],
  Marketing: ['Marketing Specialist', 'Content Manager', 'Designer'],
  Operations: ['Operations Coordinator', 'Office Manager', 'Logistics Planner'],
  Legal: ['Associate', 'Paralegal', 'Counsel'],
  HR: ['HR Generalist', 'Recruiter'],
  Research: ['Research Scientist', 'Lab Technician', 'Data Scientist'],
};

export const VIP_TITLES = ['Chief Executive Officer', 'Managing Partner', 'Chief Technology Officer'] as const;
export const CONTRACTOR_TITLES = ['Facility Technician', 'Electrician', 'HVAC Technician', 'Cleaner'] as const;
export const SECURITY_TITLES = ['Security Officer', 'Shift Supervisor', 'Control Room Operator'] as const;
