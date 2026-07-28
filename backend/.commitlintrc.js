module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Customize rules if needed
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation changes
        'style', // Code style changes (formatting, missing semicolons, etc.)
        'refactor', // Code refactoring
        'test', // Adding or updating tests
        'chore', // Maintenance tasks
        'perf', // Performance improvements
        'ci', // CI/CD changes
        'build', // Build system changes
        'revert', // Revert a previous commit
        'wip', // Work in progress (optional, for draft commits)
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case']],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],
    'scope-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 200],
    'body-max-line-length': [2, 'always', 300],
    'footer-max-line-length': [2, 'always', 200],
  },
  // Optional: Custom prompts for interactive commit
  prompt: {
    questions: {
      type: {
        description: "Select the type of change you're committing:",
        enum: {
          feat: {
            description: '✨ A new feature',
            title: 'Features',
            emoji: '✨',
          },
          fix: {
            description: '🐛 A bug fix',
            title: 'Bug Fixes',
            emoji: '🐛',
          },
          docs: {
            description: '📚 Documentation only changes',
            title: 'Documentation',
            emoji: '📚',
          },
          style: {
            description: '💎 Code style changes (formatting, etc.)',
            title: 'Styles',
            emoji: '💎',
          },
          refactor: {
            description: '📦 Code refactoring',
            title: 'Code Refactoring',
            emoji: '📦',
          },
          test: {
            description: '🧪 Adding or updating tests',
            title: 'Tests',
            emoji: '🧪',
          },
          chore: {
            description: '🔧 Maintenance and chores',
            title: 'Chores',
            emoji: '🔧',
          },
          perf: {
            description: '🚀 Performance improvements',
            title: 'Performance',
            emoji: '🚀',
          },
        },
      },
    },
  },
};
