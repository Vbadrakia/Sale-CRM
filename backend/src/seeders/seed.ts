/**
 * Development seed script: `npm run db:seed`
 * Creates one admin, three BDEs, sample leads, follow-ups, a customer,
 * activities and notifications. Never run this against production data.
 */
import bcrypt from 'bcryptjs';
import {
  Activity,
  Customer,
  FollowUp,
  Lead,
  Notification,
  User,
  sequelize,
} from '../models';
import { LeadPriority, LeadStatus } from '../types';

const DEMO_PASSWORD = 'Password123';

const COMPANIES = [
  ['Northwind Logistics', 'Priya Sharma', 'Operations Head', 'India', 'Maharashtra', 'Mumbai', 'Logistics'],
  ['Bluepeak Software', 'Arjun Mehta', 'CTO', 'India', 'Karnataka', 'Bengaluru', 'Software'],
  ['Crescent Textiles', 'Fatima Khan', 'Procurement Manager', 'India', 'Gujarat', 'Surat', 'Manufacturing'],
  ['Harbor Foods', 'Daniel Cruz', 'Founder', 'United States', 'California', 'San Diego', 'Food & Beverage'],
  ['Vertex Consulting', 'Sarah Klein', 'Director', 'Germany', 'Bavaria', 'Munich', 'Consulting'],
  ['Solaris Energy', 'Rahul Nair', 'Project Lead', 'India', 'Tamil Nadu', 'Chennai', 'Energy'],
  ['Quantum Retail', 'Meera Iyer', 'Head of Growth', 'India', 'Delhi', 'New Delhi', 'Retail'],
  ['Ironclad Security', 'Tom Baxter', 'Managing Partner', 'United Kingdom', 'England', 'Manchester', 'Security'],
  ['Lumen Health', 'Anita Desai', 'Clinical Director', 'India', 'Telangana', 'Hyderabad', 'Healthcare'],
  ['Pioneer Estates', 'Vikram Singh', 'Sales Head', 'India', 'Rajasthan', 'Jaipur', 'Real Estate'],
  ['Atlas Freight', 'Grace Owusu', 'Logistics Manager', 'Ghana', 'Greater Accra', 'Accra', 'Logistics'],
  ['Everbright Media', 'Leo Fernandes', 'Creative Director', 'India', 'Goa', 'Panaji', 'Media'],
];

const SOURCES = ['Website', 'Referral', 'LinkedIn', 'Cold Call', 'Trade Show', 'Email Campaign'];
const SERVICES = ['Web Development', 'SEO Retainer', 'Mobile App', 'Cloud Migration', 'Branding'];
const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'WON', 'LOST'];
const PRIORITIES: LeadPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 3600 * 1000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function seed() {
  try {
    console.log('[seed] Starting...');
    await sequelize.authenticate();
    console.log('[seed] Connected to database.');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [admin] = await User.findOrCreate({
    where: { email: 'admin@crm.local' },
    defaults: {
      firstName: 'Ava',
      lastName: 'Admin',
      email: 'admin@crm.local',
      phone: '+911234567890',
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      emailVerified: true, // demo admin can sign in immediately
    },
  });

  const bdeSeeds = [
    { firstName: 'Ravi', lastName: 'Kumar', email: 'ravi@crm.local' },
    { firstName: 'Neha', lastName: 'Patel', email: 'neha@crm.local' },
    { firstName: 'Sam', lastName: 'Okafor', email: 'sam@crm.local' },
  ];

  const bdes: User[] = [];
  for (const item of bdeSeeds) {
    const [user] = await User.findOrCreate({
      where: { email: item.email },
      defaults: {
        ...item,
        phone: null,
        passwordHash,
        role: 'BDE',
        isActive: true,
        emailVerified: true,
      },
    });
    bdes.push(user);
  }
  console.log(`[seed] Users created/updated: ${1 + bdes.length}`);

    const existingLeads = await Lead.count();
    if (existingLeads > 0) {
      console.log(`[seed] ${existingLeads} leads already exist — skipping lead seeding`);
      return;
    }

  const leads: Lead[] = [];
  for (let i = 0; i < COMPANIES.length * 3; i += 1) {
    const [company, contact, designation, country, state, city, industry] =
      COMPANIES[i % COMPANIES.length];
    const suffix = i >= COMPANIES.length ? ` ${Math.floor(i / COMPANIES.length) + 1}` : '';
    const status = STATUSES[i % STATUSES.length];
    const bde = bdes[i % bdes.length];
    const slug = company.toLowerCase().replace(/[^a-z]/g, '');

    const lead = await Lead.create({
      leadCode: `LD-${new Date().getUTCFullYear()}-${String(i + 1).padStart(5, '0')}`,
      companyName: `${company}${suffix}`,
      contactName: contact,
      designation,
      phone: `+9198${String(76000000 + i).slice(0, 8)}`,
      alternatePhone: null,
      email: `contact${i + 1}@${slug}.example`,
      alternateEmail: null,
      website: `https://www.${slug}.example`,
      country,
      state,
      city,
      industry,
      companySize: ['1-10', '11-50', '51-200', '200+'][i % 4],
      serviceRequired: SERVICES[i % SERVICES.length],
      leadSource: SOURCES[i % SOURCES.length],
      status,
      priority: PRIORITIES[i % PRIORITIES.length],
      assignedBdeId: i % 5 === 4 ? null : bde.id,
      createdById: admin.id,
      lastContactedAt: status === 'NEW' ? null : daysFromNow(-(i % 14)),
      wonAt: status === 'WON' ? daysFromNow(-(i % 30)) : null,
      lostAt: status === 'LOST' ? daysFromNow(-(i % 30)) : null,
      lostReason: status === 'LOST' ? 'Budget not approved this quarter' : null,
      tags: i % 3 === 0 ? 'enterprise,priority' : null,
      remarks: null,
      notes: null,
    });

    await Activity.create({
      leadId: lead.id,
      userId: admin.id,
      activityType: 'LEAD_CREATED',
      description: `Lead ${lead.leadCode} created`,
      metadata: null,
    });
    if (lead.assignedBdeId) {
      await Activity.create({
        leadId: lead.id,
        userId: admin.id,
        activityType: 'LEAD_ASSIGNED',
        description: `Lead assigned to ${bde.firstName} ${bde.lastName}`,
        metadata: { assignedBdeId: lead.assignedBdeId },
      });
    }
    leads.push(lead);
  }
  console.log(`[seed] Leads created/updated: ${leads.length}`);

  // Follow-ups: a mix of overdue, today, upcoming and completed.
  const offsets = [-3, -1, 0, 1, 4, 9];
  for (let i = 0; i < 18; i += 1) {
    const lead = leads[i];
    if (!lead.assignedBdeId) continue;
    const offset = offsets[i % offsets.length];
    const due = daysFromNow(offset);
    const status = i % 4 === 3 ? 'COMPLETED' : 'PENDING';
    const followUp = await FollowUp.create({
      leadId: lead.id,
      createdById: admin.id,
      assignedToId: lead.assignedBdeId,
      title: ['Intro call', 'Send proposal', 'Pricing discussion', 'Demo walkthrough'][i % 4],
      description: 'Auto-generated development sample follow-up.',
      dueDate: isoDate(due),
      dueTime: '10:30',
      dueAt: new Date(`${isoDate(due)}T10:30:00Z`),
      status,
      completedAt: status === 'COMPLETED' ? daysFromNow(offset) : null,
      outcome: status === 'COMPLETED' ? 'Spoke with the contact; proposal shared.' : null,
    });

    if (status === 'PENDING') {
      lead.nextFollowUpAt = followUp.dueAt;
      await lead.save();
    }

    await Activity.create({
      leadId: lead.id,
      userId: admin.id,
      activityType: status === 'COMPLETED' ? 'FOLLOWUP_COMPLETED' : 'FOLLOWUP_CREATED',
      description: `Follow-up "${followUp.title}" ${status === 'COMPLETED' ? 'completed' : 'scheduled'}`,
      metadata: { followUpId: followUp.id },
    });
  }

  // Convert the won leads into customers.
  const wonLeads = leads.filter((lead) => lead.status === 'WON').slice(0, 3);
  let customerIndex = 1;
  for (const lead of wonLeads) {
    const customer = await Customer.create({
      customerCode: `CU-${new Date().getUTCFullYear()}-${String(customerIndex).padStart(5, '0')}`,
      sourceLeadId: lead.id,
      companyName: lead.companyName,
      contactName: lead.contactName,
      designation: lead.designation,
      phone: lead.phone,
      email: lead.email,
      website: lead.website,
      country: lead.country,
      state: lead.state,
      city: lead.city,
      service: lead.serviceRequired,
      assignedBdeId: lead.assignedBdeId,
      notes: 'Converted during development seeding.',
    });
    lead.convertedAt = new Date();
    await lead.save();
    await Activity.create({
      leadId: lead.id,
      userId: admin.id,
      activityType: 'LEAD_CONVERTED',
      description: `Lead converted to customer ${customer.customerCode}`,
      metadata: { customerId: customer.id },
    });
    customerIndex += 1;
  }

  for (const bde of bdes) {
    const assigned = leads.filter((lead) => lead.assignedBdeId === bde.id).slice(0, 2);
    for (const lead of assigned) {
      await Notification.create({
        userId: bde.id,
        type: 'LEAD_ASSIGNED',
        title: 'New lead assigned',
        message: `${lead.companyName} (${lead.leadCode}) has been assigned to you.`,
        entityType: 'lead',
        entityId: lead.id,
        dedupeKey: `seed:lead:${lead.id}:${bde.id}`,
        isRead: false,
      });
    }
  }

    // Synchronize sequence counters with seeded max values
    await sequelize.query('CREATE SEQUENCE IF NOT EXISTS lead_code_seq;');
    await sequelize.query('CREATE SEQUENCE IF NOT EXISTS customer_code_seq;');
    await sequelize.query(
      "SELECT setval('lead_code_seq', COALESCE((SELECT MAX(CAST(SUBSTRING(lead_code FROM '[0-9]+$') AS INTEGER)) FROM leads), 0) + 1, false);",
    );
    await sequelize.query(
      "SELECT setval('customer_code_seq', COALESCE((SELECT MAX(CAST(SUBSTRING(customer_code FROM '[0-9]+$') AS INTEGER)) FROM customers), 0) + 1, false);",
    );

    console.log('[seed] Completed successfully.');
    console.log('[seed] Admin: admin@crm.local / ' + DEMO_PASSWORD);
    console.log('[seed] BDEs: ravi@crm.local, neha@crm.local, sam@crm.local / ' + DEMO_PASSWORD);
  } catch (error) {
    console.error('[seed] failed', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => undefined);
  }
}

void seed();
