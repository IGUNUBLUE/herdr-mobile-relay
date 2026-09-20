<script module lang="ts">
  export type AgentLogoKind = 'claude' | 'codex' | 'devin' | 'generic' | 'hermes' | 'kimi' | 'omp' | 'opencode' | 'pi' | 'qoder';

  export function agentLogoKind(value: string): AgentLogoKind {
    const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    if (['claude', 'claude code', 'claudecode'].includes(normalized)) return 'claude';
    if (['devin', 'devin ai'].includes(normalized)) return 'devin';
    if (['codex', 'codex cli'].includes(normalized)) return 'codex';
    if (['open code', 'opencode'].includes(normalized)) return 'opencode';
    if (['pi', 'pi coding agent'].includes(normalized)) return 'pi';
    if (['oh my pi', 'omp'].includes(normalized)) return 'omp';
    if (['kimi', 'kimi cli', 'kimi code', 'kimi code cli'].includes(normalized)) return 'kimi';
    if (['qoder', 'qoder cli', 'qodercli'].includes(normalized)) return 'qoder';
    if (['hermes', 'hermes agent', 'hermesagent'].includes(normalized)) return 'hermes';
    return 'generic';
  }

  export function hasAgentLogo(value: string | undefined): boolean {
    return agentLogoKind(value || '') !== 'generic';
  }

  export function agentLogoLabel(value: AgentLogoKind, original: string): string {
    if (value === 'claude') return 'Claude Code';
    if (value === 'devin') return 'Devin';
    if (value === 'codex') return 'Codex';
    if (value === 'opencode') return 'OpenCode';
    if (value === 'pi') return 'Pi';
    if (value === 'omp') return 'Oh My Pi';
    if (value === 'kimi') return 'Kimi';
    if (value === 'qoder') return 'Qoder';
    if (value === 'hermes') return 'Hermes';
    return original.trim() || 'Agent';
  }

  /*
   * The Codex and Claude Code vector paths are from LobeHub/lobe-icons.
   * MIT License, Copyright (c) 2023 LobeHub.
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   * Source: https://github.com/lobehub/lobe-icons
   */
</script>

<script lang="ts">
  let { agent = '' }: { agent?: string } = $props();

  const kind = $derived(agentLogoKind(agent));
  const label = $derived(agentLogoLabel(kind, agent));
</script>

<span class={`agent-logo agent-logo-${kind}`} role="img" aria-label={label} title={label}>
  {#if kind === 'hermes'}
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="#fff3ec" />
      <g transform="translate(3.5 3.5) scale(.75)" fill="#ea580c">
        <!-- Hermes winged helmet motif -->
        <path fill-rule="evenodd" d="M14 3.5C8.2 3.5 3.5 8.2 3.5 14c0 2.4.8 4.6 2.2 6.4L4 24.5l4.3-1.4c1.7 1 3.6 1.6 5.7 1.6 5.8 0 10.5-4.7 10.5-10.5S19.8 3.5 14 3.5zm-1 4.5h2v6.5h-2V8zm1 12.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z" />
        <path d="M21.5 5.5l-4 2.5 1.5 3.5 4.5-2.5z" opacity=".85" />
        <path d="M6.5 5.5l4 2.5-1.5 3.5-4.5-2.5z" opacity=".85" />
      </g>
    </svg>
  {:else if kind === 'codex'}
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="#eef0ff" />
      <path transform="translate(4 4) scale(.8333)" fill="#4f5ff7" fill-rule="evenodd" d="M8.086.457a6.105 6.105 0 0 1 3.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 0 0 .107.029c1.408-.346 2.762-.224 4.061.366l.217.106c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 0 1-.18 1.631.167.167 0 0 0 .04.155 5.982 5.982 0 0 1 1.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 0 1-2.934 1.851.162.162 0 0 0-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 0 0-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 0 1-2.595-.622 6.058 6.058 0 0 1-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 0 1-.495-1.283 6.11 6.11 0 0 1-.017-3.064.166.166 0 0 0 .008-.074.115.115 0 0 0-.037-.064 5.958 5.958 0 0 1-1.38-2.202 5.196 5.196 0 0 1-.333-1.589 6.915 6.915 0 0 1 .188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 0 0 .087-.087A6.016 6.016 0 0 1 5.635 2.31C6.315 1.464 7.132.846 8.086.457Zm-.804 7.85a.848.848 0 0 0-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 0 0 1.46.864l1.94-3.272a.849.849 0 0 0 .007-.854l-1.94-3.393Zm5.446 6.24a.849.849 0 0 0 0 1.695h4.848a.849.849 0 0 0 0-1.696h-4.848Z" />
    </svg>
  {:else if kind === 'claude'}
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="#fff0eb" />
      <path transform="translate(3.5 3.5) scale(.875)" fill="#d97757" fill-rule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949ZM6 10.949h1.488V8.102H6v2.847Zm10.51 0H18V8.102h-1.49v2.847Z" />
    </svg>
  {:else if kind === 'opencode'}
    <svg viewBox="0 0 64 52" aria-hidden="true">
      <rect width="64" height="52" rx="10" fill="#211e1e" />
      <g transform="translate(5 5)">
        <path fill="#4b4646" d="M18 30H6V18h12v12Zm30 0H36V18h12v12Z" />
        <path fill="#b7b1b1" d="M18 12H6v18h12V12Zm6 24H0V6h24v30Zm24-6V12H36v18h12Zm6 6H36v6h-6V6h24v30Z" />
      </g>
    </svg>
  {:else if kind === 'devin'}
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="#f4f4f5" />
      <g transform="translate(2 2)">
        <path fill-rule="evenodd" d="M2.033 9.867l2.554 1.483a.589.589 0 00.592 0l2.554-1.483.01-.008a.608.608 0 00.11-.084l.013-.015a.631.631 0 00.076-.1c.003-.005.008-.01.01-.016a.558.558 0 00.052-.125l.007-.028a.611.611 0 00.019-.14V7.868c0-.572.307-1.105.8-1.392a1.595 1.595 0 011.598 0l1.277.742a.54.54 0 00.129.053l.028.01c.044.01.088.015.133.016h.006l.013-.002a.587.587 0 00.27-.074l.011-.004 2.554-1.483a.596.596 0 00.297-.516V2.253a.595.595 0 00-.297-.516L12.293.257a.587.587 0 00-.591 0L9.148 1.737l-.01.01a.609.609 0 00-.109.083l-.014.015a.632.632 0 00-.076.1c-.003.005-.008.01-.01.016a.57.57 0 00-.052.124l-.007.028a.612.612 0 00-.018.14v1.483c0 .572-.307 1.105-.8 1.393a1.597 1.597 0 01-1.599 0l-1.276-.742a.603.603 0 00-.13-.053l-.028-.008a.658.658 0 00-.133-.018h-.02a.57.57 0 00-.269.074c-.003.002-.008.002-.012.005L2.033 5.872a.596.596 0 00-.297.515v2.966c0 .213.113.41.297.515z" />
        <path fill-rule="evenodd" d="M15.943 10.607a1.596 1.596 0 011.599 0l1.276.74c.041.025.085.04.13.055l.028.008c.043.01.088.016.133.018h.005c.005 0 .01-.002.014-.003a.474.474 0 00.122-.016l.021-.005a.616.616 0 00.126-.052c.004-.002.009-.002.013-.005l2.554-1.482a.597.597 0 00.297-.516V6.383a.596.596 0 00-.297-.515l-2.552-1.483a.587.587 0 00-.592 0l-2.553 1.482-.011.008a.61.61 0 00-.108.084l-.014.016a.637.637 0 00-.076.1c-.003.005-.008.01-.01.016a.57.57 0 00-.052.124l-.007.029a.612.612 0 00-.018.14v1.482c0 .572-.307 1.105-.8 1.393a1.597 1.597 0 01-1.599 0l-1.276-.742a.584.584 0 00-.13-.053l-.028-.008a.62.62 0 00-.133-.018h-.02a.587.587 0 00-.269.074l-.012.004L9.15 10a.596.596 0 00-.296.516v2.966c0 .212.112.409.296.515l2.554 1.483s.008.002.012.005c.04.022.082.04.126.052l.02.004a.57.57 0 00.123.017l.014.002h.006c.054 0 .108-.01.16-.025a.587.587 0 00.13-.054l1.277-.741a1.597 1.597 0 012.398 1.392v1.482c0 .049.007.095.019.14l.007.028a.619.619 0 00.051.125c.004.006.008.01.01.016a.6.6 0 00.076.1l.014.015c.033.032.069.06.108.084.004.002.006.006.011.008l2.554 1.483a.59.59 0 00.593 0l2.554-1.483a.597.597 0 00.296-.516v-2.965a.595.595 0 00-.296-.516l-2.554-1.483s-.008-.002-.012-.005a.54.54 0 00-.126-.051c-.007-.003-.013-.003-.02-.005a.635.635 0 00-.125-.017h-.018a.557.557 0 00-.16.026.588.588 0 00-.13.053l-1.276.742a1.595 1.595 0 01-1.598 0 1.615 1.615 0 010-2.785l-.005-.001z" />
        <path fill-rule="evenodd" d="M14.848 18.265l-2.554-1.482-.012-.005a.526.526 0 00-.126-.052c-.007-.002-.014-.002-.02-.005a.64.64 0 00-.124-.017h-.02a.56.56 0 00-.16.026.588.588 0 00-.13.053l-1.276.742a1.594 1.594 0 01-1.598 0c-.493-.286-.8-.82-.8-1.393V14.65a.563.563 0 00-.018-.14l-.008-.028a.604.604 0 00-.051-.124l-.01-.017a.603.603 0 00-.076-.1l-.014-.015a.596.596 0 00-.109-.084c-.003-.002-.005-.006-.01-.008L5.178 12.65a.587.587 0 00-.591 0l-2.554 1.483a.596.596 0 00-.297.516v2.965c0 .213.113.41.297.516l2.554 1.483.012.004a.618.618 0 00.267.074l.016.002h.007a.55.55 0 00.16-.026.584.584 0 00.129-.053l1.277-.742a1.597 1.597 0 012.398 1.393v1.482c0 .05.007.095.019.14l.007.028c.013.044.03.085.051.125l.01.016c.022.036.047.07.076.1l.014.015c.032.032.069.06.109.084l.01.008 2.554 1.483a.587.587 0 00.593 0l2.554-1.483a.596.596 0 00.296-.515v-2.966a.596.596 0 00-.296-.516h-.002z" />
      </g>
    </svg>
  {:else if kind === 'pi'}
    <svg viewBox="0 0 800 800" aria-hidden="true">
      <rect width="800" height="800" rx="120" fill="#09090b" />
      <path fill="#fff" fill-rule="evenodd" d="M165.29 165.29h352.07V400H400v117.36H282.65v117.36H165.29ZM282.65 282.65V400H400V282.65Z" />
      <path fill="#fff" d="M517.36 400h117.36v234.72H517.36Z" />
    </svg>
  {:else if kind === 'omp'}
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <rect width="120" height="90" rx="18" fill="#0d0d0d" />
      <rect x="10" y="8" width="100" height="12" rx="2" fill="#fafafa" />
      <rect x="25" y="20" width="12" height="62" rx="2" fill="#fafafa" />
      <rect x="75" y="20" width="12" height="45" rx="2" fill="#fafafa" />
      <rect x="71" y="55" width="20" height="16" rx="3" fill="#f97316" />
      <rect x="76" y="59" width="3" height="8" rx="1" fill="#0d0d0d" />
      <rect x="82" y="59" width="3" height="8" rx="1" fill="#0d0d0d" />
      <circle cx="18" cy="14" r="2" fill="#f97316" opacity=".8" />
      <circle cx="102" cy="14" r="2" fill="#f97316" opacity=".8" />
    </svg>
  {:else if kind === 'kimi'}
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="#fff" />
      <g transform="translate(2 1.5)">
        <path fill="#1783ff" d="M21.72.94a2.23 2.23 0 0 1 0 4.46h-1.97a.26.26 0 0 1-.26-.26V3.17A2.23 2.23 0 0 1 21.72.94Z" />
        <path fill="#000" d="m9.39 13.95 8.43-8.36c.16-.16.07-.47-.14-.47h-4.54a.2.2 0 0 0-.14.06l-9.08 9.01c-.14.14-.35.02-.35-.21V5.39c0-.15-.1-.27-.22-.27H.22c-.12 0-.22.12-.22.27v18.53c0 .15.1.27.22.27h3.13c.12 0 .22-.12.22-.27v-3.78c0-.08.03-.16.08-.21l2.82-2.79a.2.2 0 0 1 .24-.03l7.53 5.54a8.64 8.64 0 0 0 4.01 1.49c.12.01.23-.11.23-.27v-3.56c0-.14-.08-.25-.19-.26a5.9 5.9 0 0 1-2.35-.94l-6.52-4.72c-.14-.09-.15-.32-.03-.44Z" />
      </g>
    </svg>
  {:else if kind === 'qoder'}
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="#111113" />
      <path transform="translate(-227 -40)" fill="#fff" d="M276.62 136.66a46.4 46.4 0 0 1-32.9-13.72A45.4 45.4 0 0 1 230 90.04a46.1 46.1 0 0 1 13.72-33.32A45.4 45.4 0 0 1 276.62 43a46 46 0 0 1 33.04 13.72 46 46 0 0 1 13.72 33.32 46.2 46.2 0 0 1-14.84 34.02h14.84v12.6h-46.76Zm0-80.92a33.4 33.4 0 0 0-24.08 9.94 34.2 34.2 0 0 0-9.94 24.36 33.4 33.4 0 0 0 9.94 24.08 33.4 33.4 0 0 0 24.08 9.94 33.4 33.4 0 0 0 24.08-9.94 33.4 33.4 0 0 0 9.94-24.08 34.2 34.2 0 0 0-9.94-24.36 33.4 33.4 0 0 0-24.08-9.94Z" />
    </svg>
  {:else}
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <rect x=".75" y=".75" width="26.5" height="26.5" rx="5.25" fill="var(--input)" stroke="var(--border)" stroke-width="1.5" />
      <path d="m7.5 9 4.5 5-4.5 5M14 19h6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  {/if}
</span>
