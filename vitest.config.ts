import { defineConfig } from 'vitest/config'

// Only this package's own tests. The release workflow checks the emulator
// out into the workspace, and its node:test files are not for vitest.
export default defineConfig({
    test: {
        include: ['test/**/*.test.ts', 'src/**/*.test.ts']
    }
})
