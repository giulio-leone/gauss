import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Gauss',
  tagline: 'AI Agent Framework with Hexagonal Architecture',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://giulio-leone.github.io',
  baseUrl: '/gauss/',

  organizationName: 'giulio-leone',
  projectName: 'gauss',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/giulio-leone/gauss/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Gauss',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://www.npmjs.com/package/gauss',
          label: 'npm',
          position: 'right',
        },
        {
          href: 'https://github.com/giulio-leone/gauss',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Learn',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/',
            },
            {
              label: 'Concepts',
              to: '/docs/concepts',
            },
            {
              label: 'Cookbook',
              to: '/docs/cookbook',
            },
          ],
        },
        {
          title: 'Features',
          items: [
            {
              label: 'Workflows & Graphs',
              to: '/docs/workflows',
            },
            {
              label: 'Voice (STT/TTS)',
              to: '/docs/voice',
            },
            {
              label: 'Multi-Agent Teams',
              to: '/docs/teams',
            },
            {
              label: 'Multimodal',
              to: '/docs/multimodal',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/giulio-leone/gauss',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/@giulio-leone/gauss',
            },
            {
              label: 'Comparison',
              to: '/docs/comparison',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Gauss. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
