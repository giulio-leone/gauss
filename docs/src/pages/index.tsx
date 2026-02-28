import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';

import styles from './index.module.css';

const heroCode = `import gauss from 'gauss'

// Zero config — auto-detects your API key
const answer = await gauss('Explain quantum computing')

// Or use the full agent builder
import { agent, tool } from 'gauss'
import { openai } from 'gauss/providers'

const myAgent = agent({
  model: openai('gpt-5.2'),
  tools: [weatherTool, searchTool],
}).build()

const result = await myAgent.run('What\\'s the weather in Tokyo?')`;

const features = [
  {
    icon: '🤖',
    title: 'Agents & Teams',
    description: 'Build single agents or multi-agent teams with 4 coordination strategies.',
  },
  {
    icon: '🔗',
    title: 'Workflows & Graphs',
    description: 'Chain steps with .then(), branch, and parallelize. Or build DAG graphs.',
  },
  {
    icon: '🔊',
    title: 'Voice & Multimodal',
    description: 'STT/TTS with OpenAI Whisper & ElevenLabs. Vision, OCR, video analysis.',
  },
  {
    icon: '📚',
    title: 'RAG Pipeline',
    description: 'Ingest → chunk → embed → store → retrieve. With Graph RAG support.',
  },
  {
    icon: '🌐',
    title: '40+ AI Providers',
    description: 'UniversalProvider wraps any @ai-sdk/* package. One API for all models.',
  },
  {
    icon: '🏗️',
    title: 'Hexagonal Architecture',
    description: 'Ports & Adapters. Swap any component without touching business logic.',
  },
  {
    icon: '🔌',
    title: 'MCP + A2A',
    description: 'Model Context Protocol and Agent-to-Agent communication built-in.',
  },
  {
    icon: '🧪',
    title: 'LLM Recording',
    description: 'Record and replay LLM calls for deterministic, fast tests.',
  },
  {
    icon: '⚡',
    title: 'Zero Config',
    description: 'One line to start. Auto-detects provider from environment variables.',
  },
];

const stats = [
  { value: '57', label: 'Features' },
  { value: '1740', label: 'Tests' },
  { value: '40+', label: 'Providers' },
  { value: '17', label: 'Examples' },
  { value: '100%', label: 'Coverage vs Competitors' },
];

function HomepageHeader() {
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <div className={styles.heroText}>
            <Heading as="h1" className="hero__title">
              Build AI Agents<br />with TypeScript
            </Heading>
            <p className="hero__subtitle">
              The most complete agent framework — 57 features, hexagonal architecture, zero config to start.
            </p>
            <div className={styles.buttons}>
              <Link
                className="button button--secondary button--lg"
                to="/docs/">
                Get Started →
              </Link>
              <Link
                className={clsx('button button--outline button--lg', styles.githubBtn)}
                href="https://github.com/giulio-leone/gauss">
                GitHub
              </Link>
            </div>
            <div className={styles.installCmd}>
              <code>npm install @giulio-leone/gauss</code>
            </div>
          </div>
          <div className={styles.heroCode}>
            <CodeBlock language="typescript" title="gauss in action">
              {heroCode}
            </CodeBlock>
          </div>
        </div>
      </div>
    </header>
  );
}

function StatsBar() {
  return (
    <section className={styles.statsSection}>
      <div className="container">
        <div className="stats-bar">
          {stats.map(({ value, label }) => (
            <div className="stat-item" key={label}>
              <span className="stat-value">{value}</span>
              <span className="stat-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesGrid() {
  return (
    <section className={styles.features}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Everything you need to build production AI agents
        </Heading>
        <div className={styles.featureGrid}>
          {features.map(({ icon, title, description }) => (
            <div className="feature-card" key={title}>
              <h3>{icon} {title}</h3>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComparisonSection() {
  return (
    <section className={styles.comparison}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Why Gauss?
        </Heading>
        <p className={styles.sectionSubtitle}>
          More features than any other TypeScript agent framework.
        </p>
        <div className={styles.comparisonTable}>
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Gauss</th>
                <th>Mastra</th>
                <th>Agno</th>
                <th>LangChain</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Feature Coverage</td><td><strong>57/57</strong></td><td>36/57</td><td>31/57</td><td>12/57</td></tr>
              <tr><td>Multi-Agent Teams</td><td>✅</td><td>❌</td><td>✅</td><td>❌</td></tr>
              <tr><td>Workflow DSL</td><td>✅</td><td>partial</td><td>❌</td><td>❌</td></tr>
              <tr><td>Voice STT/TTS</td><td>✅</td><td>✅</td><td>✅</td><td>❌</td></tr>
              <tr><td>Video Processing</td><td>✅</td><td>❌</td><td>❌</td><td>❌</td></tr>
              <tr><td>Hexagonal Architecture</td><td>✅</td><td>❌</td><td>❌</td><td>❌</td></tr>
              <tr><td>MCP + A2A</td><td>✅</td><td>MCP</td><td>❌</td><td>❌</td></tr>
              <tr><td>Graph RAG</td><td>✅</td><td>❌</td><td>❌</td><td>❌</td></tr>
              <tr><td>LLM Recording</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td></tr>
              <tr><td>Plugin System</td><td>✅</td><td>partial</td><td>❌</td><td>❌</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{textAlign: 'center', marginTop: '1.5rem'}}>
          <Link to="/docs/comparison" className={styles.comparisonLink}>
            See full comparison →
          </Link>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className={styles.cta}>
      <div className="container" style={{textAlign: 'center'}}>
        <Heading as="h2" className={styles.ctaTitle}>
          Ready to build?
        </Heading>
        <p className={styles.ctaSubtitle}>
          Get started in seconds with zero configuration.
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/">
            Read the Docs
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="/docs/cookbook">
            Browse Cookbook
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="AI Agent Framework for TypeScript"
      description="The most complete AI agent framework — 57 features, hexagonal architecture, zero config. Agents, teams, workflows, RAG, voice, multimodal, 40+ providers.">
      <HomepageHeader />
      <main>
        <StatsBar />
        <FeaturesGrid />
        <ComparisonSection />
        <CTASection />
      </main>
    </Layout>
  );
}
