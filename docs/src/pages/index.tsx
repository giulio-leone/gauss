import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/">
            Get Started →
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="AI Agent Framework"
      description="Gauss — AI Agent Framework with Hexagonal Architecture, built on Vercel AI SDK v6">
      <HomepageHeader />
      <main>
        <section style={{padding: '2rem 0'}}>
          <div className="container">
            <div className="row">
              <div className="col col--4" style={{padding: '1rem'}}>
                <Heading as="h3">🏗️ Hexagonal Architecture</Heading>
                <p>Clean separation with ports and adapters. Swap any implementation without touching business logic.</p>
              </div>
              <div className="col col--4" style={{padding: '1rem'}}>
                <Heading as="h3">🤖 57 Features, Zero Config</Heading>
                <p>Agents, teams, workflows, RAG, voice, multimodal, video, planning — all from a single import.</p>
              </div>
              <div className="col col--4" style={{padding: '1rem'}}>
                <Heading as="h3">🌐 40+ AI Providers</Heading>
                <p>OpenAI, Anthropic, Google, Mistral, Groq, Ollama, Azure, Bedrock — use any provider with one API.</p>
              </div>
            </div>
            <div className="row">
              <div className="col col--4" style={{padding: '1rem'}}>
                <Heading as="h3">👥 Multi-Agent Teams</Heading>
                <p>Coordinator + specialists with 4 strategies: round-robin, delegate, broadcast, pipeline.</p>
              </div>
              <div className="col col--4" style={{padding: '1rem'}}>
                <Heading as="h3">🔊 Voice & Multimodal</Heading>
                <p>STT/TTS with OpenAI Whisper & ElevenLabs. Image analysis, OCR, video processing built-in.</p>
              </div>
              <div className="col col--4" style={{padding: '1rem'}}>
                <Heading as="h3">🔌 Plugin System</Heading>
                <p>Guardrails, evals, observability, caching, MCP, A2A — extend agents with cross-cutting concerns.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
