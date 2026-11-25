import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PLUGIN_PUBLISHER_ADDRESS as address, PLUGIN_PUBLISHER_NAME as publisher } from '@/app/lib/plugin-publisher';
import styles from './information.module.css';

const email = 'contact@trialagents.com';
const base = 'https://pipeline.trialagents.com/pipeline-info/';
const pages = {
  about: {
    title: 'TrialAgents Pipeline',
    description: 'Plan biotech programs, milestones and decisions in ChatGPT, Claude or the TrialAgents app.',
    body: <>
      <p>Connect your TrialAgents account to save changes and revisit the same workspace in your browser or assistant.</p>
      <p>Readers can explore records and shared views. Editors and owners can create and edit records and shared custom views. Only owners can customize workspace structure, including tables, fields, relationships and navigation.</p>
      <p>Record changes can email workspace members according to their notification preferences. An eligible owner can also send an invitation to a specified email address. Your assistant may ask you to confirm an action according to your account and workspace settings.</p>
    </>,
  },
  connectors: {
    title: 'Pipeline connector guide',
    description: 'Connect ChatGPT or Claude to your Pipeline workspace and check what your account can do.',
    body: <>
      <h2>Before you connect</h2>
      <p>Use the TrialAgents account that owns the workspace or received its invitation. Individual use is free. An owner needs a Team subscription to invite colleagues. Your assistant workspace may also require an administrator to enable connectors.</p>
      <h2>Connect ChatGPT</h2>
      <p>Open Plugins and select TrialAgents Pipeline if it is available to your workspace. Choose Connect and sign in to TrialAgents. If you are setting up a custom MCP connection, select Add custom MCP server and enter <code>https://mcp.trialagents.com/pipeline/chatgpt</code>. Choose OAuth and complete the sign-in prompt.</p>
      <h2>Connect Claude</h2>
      <p>Open Customize → Connectors and select TrialAgents Pipeline if available. For a custom connection, add a remote connector with <code>https://mcp.trialagents.com/pipeline/claude</code>. If you are asked to choose an OAuth client for manual setup, choose automatic registration. Select Connect and sign in to TrialAgents.</p>
      <h2>Try it in a conversation</h2>
      <p>Ask “Which milestones are due next?” to read your workspace. To try a write as an editor or owner, ask “Create a shared view of open milestones grouped by program.” Open the result in Pipeline to check the saved view. Creating a shared view and adding it to the workspace navigation are separate actions. Only the owner can change navigation.</p>
      <h2>Access and troubleshooting</h2>
      <p>If a workspace is missing, check the email you signed in with and whether you accepted its invitation. If you can read records but cannot save edits, ask the workspace owner to check your role. For an expired sign-in, reconnect the affected assistant using its own URL above. To stop using a connector, disconnect it in that assistant’s connection settings. Saved workspace records remain available to authorized members.</p>
    </>,
  },
  support: {
    title: 'Pipeline support',
    description: 'Get help with account connections, workspace access, saved work or invitations.',
    body: <>
      <p>For product support, privacy requests or a security concern, email us below. Tell us whether you were using the browser, ChatGPT or Claude, what you were trying to do, and the error message if there was one. Keep passwords, access tokens, patient details and private workspace records out of your message.</p>
      <p>For setup steps or help with sign-in and permissions, see the <a href="/pipeline-info/connectors">connector guide</a>.</p>
    </>,
  },
  privacy: {
    title: 'Pipeline privacy policy',
    description: 'How TrialAgents handles your account and workspace information when you use Pipeline in a browser, ChatGPT or Claude.',
    body: <>
      <h2>Who handles your information</h2>
      <p>{publisher}, {address}, operates TrialAgents Pipeline. Use the email below for privacy requests. If your organization manages your workspace, its owner controls membership and can help with requests concerning the organization’s records.</p>
      <h2>What we process and why</h2>
      <p>We use account names, email addresses, sign-in information and membership roles to provide access. We store the records, assignments, custom tables, relationships and views you save so members can plan work together. Owners can supply a colleague’s name or email when inviting or assigning them. Activity history records who changed what and when, including previous and updated record details.</p>
      <p>If you contact support, we use the information you send to respond. For paid teams, we process customer and subscription identifiers, subscription status and billing events to manage access. Stripe handles payment details during website checkout.</p>
      <h2>Who receives information</h2>
      <p>Authorized members can read information in their workspace. When you use ChatGPT, OpenAI receives the tool results returned to that conversation. When you use Claude, Anthropic receives them. Pipeline processes the inputs the assistant sends to its tools. The assistant provider’s terms and account settings govern its handling of your conversation.</p>
      <p>Hosting and authentication providers help run the service. Resend delivers invitation and notification emails. Record notifications go to workspace members according to their notification preferences and may include workspace and record names. Invitations go to the email address supplied by the owner. Use workspace data only for purposes that your organization authorizes. Keep identifiable patient data out of Pipeline.</p>
      <h2>How long information is kept</h2>
      <p>Saved records and views are kept in the workspace until removed. Archiving a custom table or field preserves its values for restoration. Removing a record can leave prior values in the workspace history and in backups. Workspace audit entries have no automatic expiry in the application. Disconnecting an assistant ends its connection and preserves saved workspace data.</p>
      <p>The workspace database is hosted by Render in Frankfurt. Render’s rolling point-in-time recovery window is up to seven days. That window applies to provider-managed recovery copies. Contact us about separately retained records or a particular deletion request.</p>
      <p>Temporary drafts retained for retrying a custom-view save expire after 24 hours. Embedded workspace access grants expire after 10 minutes. Team invitation links expire after 7 days. Link expiry ends the ability to accept the invitation and does not itself erase its email or audit history.</p>
      <h2>Your choices and rights</h2>
      <p>You can change notification preferences, disconnect an assistant, or ask for access, correction, erasure, restriction, objection or a portable copy of your personal data, as applicable. Email us to request deletion or to ask what remains in history or backups. You may also lodge a complaint with your data protection authority, including the <a href="https://www.datenschutz-berlin.de/buergerinnen-und-buerger/beschwerde/">Berlin data protection authority</a>.</p>
    </>,
  },
  terms: {
    title: 'Pipeline terms of service',
    description: 'These terms cover use of TrialAgents Pipeline in a browser and through its ChatGPT and Claude connectors.',
    body: <>
      <p>TrialAgents Pipeline is operated by {publisher}, {address}. By using Pipeline you agree to these terms. If you act for an organization, you must have authority to do so.</p>
      <p>Use Pipeline for lawful professional planning with material you have the right to process. Protect your credentials and respect workspace permissions. You retain rights to your submitted material. TrialAgents retains rights to its software and templates.</p>
      <p>Review generated records, views and analyses before relying on them for clinical, financial or regulatory decisions. Individual workspace features are free. Team invitations require a paid Team subscription. Owners manage subscriptions through the web app’s Billing page. The website checkout and any separate purchase agreement govern purchases made there.</p>
      <p>We aim to provide reliable access. Service availability and generated results vary. Your mandatory legal rights and any separate written agreement continue to apply.</p>
    </>,
  },
} as const;

type PageProps = { params: Promise<{ section: string }> };

function getPage(section: string) {
  if (!Object.hasOwn(pages, section)) notFound();
  return pages[section as keyof typeof pages];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { section } = await params;
  const { title, description } = getPage(section);
  const url = base + section;
  return {
    title, description, alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'TrialAgents Pipeline', type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function PipelineInformation({ params }: PageProps) {
  const { section } = await params;
  const page = getPage(section);
  return (
    <main className={styles.page}>
      <article className={styles.article} aria-labelledby="information-title">
        <header>
          <p className={styles.publisher}>TrialAgents Pipeline · {publisher}</p>
          <h1 id="information-title">{page.title}</h1>
        </header>
        <div className={styles.copy}>
          <p>{page.description}</p>
          {(section === 'privacy' || section === 'terms') && <p><small>Updated <time dateTime="2026-11-25">25 November 2026</time></small></p>}
          {page.body}
          <p><a href={'mailto:' + email}>{email}</a></p>
        </div>
        <nav className={styles.links} aria-label="Pipeline information">
          {Object.entries(pages).filter(([id]) => id !== section).map(([id, info]) => (
            <a key={id} href={'/pipeline-info/' + id}>{info.title}</a>
          ))}
          <a href="/">Open TrialAgents app</a>
        </nav>
      </article>
    </main>
  );
}
