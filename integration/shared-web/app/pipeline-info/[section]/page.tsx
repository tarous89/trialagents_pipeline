import {notFound} from 'next/navigation';
import {PLUGIN_PUBLISHER_NAME as publisher,PLUGIN_PUBLISHER_ADDRESS as address,PLUGIN_SUPPORT_EMAIL as email} from '@/app/lib/plugin-publisher';
import styles from './information.module.css';

const pages = {
 about: ['TrialAgents Pipeline', 'Plan biotech programs, milestones and decisions in ChatGPT, Claude or the TrialAgents app. Connect your TrialAgents account to save changes and revisit the same workspace.', 'Readers can explore records and shared views. Editors and owners can create and edit records and shared custom views. Only owners can customize workspace structure, including tables, fields, relationships and navigation.', 'Record changes can email workspace members according to their notification preferences. An eligible owner can also send an invitation to a specified email address. ChatGPT may ask for confirmation according to your account and workspace settings.'],
 support: ['Pipeline support', 'For help with account connection, access, saved work or invitations, describe the action you were taking and the message you saw. Keep passwords, access tokens and private workspace records out of your message.'],
 privacy: ['Pipeline privacy policy', publisher+' operates TrialAgents Pipeline on the web and in ChatGPT. We use your account name, email and authentication information to connect you to the workspaces you can access. We process the operational records, custom tables, relationships, views and control values that you choose to save.',
 'Workspace roles govern access. Record notifications go to workspace members according to their notification preferences and can include the record and workspace names. Invitations go to the email address provided by an authorized owner. Record changes, approvals and invitation events are logged for workspace accountability. Infrastructure, authentication and email providers help deliver the service.',
 'When you use Pipeline in ChatGPT, OpenAI receives the tool inputs and requested workspace results. Your OpenAI account settings and terms govern how OpenAI handles that information. Keep identifiable patient data out of your workspace.',
 'Saved records and views persist across sessions. Archiving a schema definition preserves its values for restoration. Removing a record may retain information in history, operational records and backups. Disconnecting ChatGPT revokes its connection. Contact us to request access, correction, export or erasure, including review of retained records.'],
 terms: ['Pipeline terms of service', 'TrialAgents Pipeline is operated by '+publisher+', '+address+'. By using Pipeline you agree to these terms. If you act for an organization, you must have authority to do so.',
 'Use Pipeline for lawful professional planning with material you have the right to process. Protect your credentials and respect workspace permissions. You retain rights to your submitted material. TrialAgents retains rights to its software and templates.',
 'Review generated records, views and analyses before relying on them for clinical, financial or regulatory decisions. Individual workspace features are free. Team invitations require the applicable team entitlement. Any separate website agreement governs purchases made there.',
 'We aim to provide reliable access. Service availability and generated results vary. Your mandatory legal rights and any separate written agreement continue to apply.']
} as const;
type PageKey = keyof typeof pages;

export default async function PipelineInformation({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!Object.hasOwn(pages, section)) notFound();
  const [title, ...paragraphs] = pages[section as PageKey];

  return (
    <main className={styles.page}>
      <article className={styles.article} aria-labelledby="information-title">
        <header>
          <p className={styles.publisher}>TrialAgents Pipeline · {publisher}</p>
          <h1 id="information-title">{title}</h1>
        </header>
        <div className={styles.copy}>
          {paragraphs.map(text => <p key={text}>{text}</p>)}
          <p><a href={'mailto:' + email}>{email}</a></p>
        </div>
        <nav className={styles.links} aria-label="Pipeline information">
          {Object.entries(pages).filter(([id]) => id !== section).map(([id, [label]]) => (
            <a key={id} href={'/pipeline-info/' + id}>{label}</a>
          ))}
          <a href="/">Open TrialAgents app</a>
        </nav>
      </article>
    </main>
  );
}
