<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    icon,
    title = '',
    subtitle = '',
    children,
    control,
    class: className = '',
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    icon?: Snippet;
    title?: string;
    subtitle?: string;
    children?: Snippet;
    control?: Snippet;
  } = $props();
</script>

<div class={`settings-row ${className}`} {...rest}>
  {#if icon}
    <div class="row-icon" aria-hidden="true">{@render icon()}</div>
  {/if}
  <div class="row-content">
    {#if title}<span class="row-title">{title}</span>{/if}
    {#if subtitle}<p class="hint">{subtitle}</p>{/if}
    {@render children?.()}
  </div>
  {#if control}
    <div class="row-control">{@render control()}</div>
  {/if}
</div>

<style>
  .settings-row {
    align-items: center;
    display: flex;
    gap: .8rem;
    min-height: 3rem;
    padding: .55rem .9rem;
  }
  .settings-row:not(:first-child) { border-top: 1px solid var(--border); }
  .row-icon {
    align-items: center;
    color: var(--muted);
    display: flex;
    flex: 0 0 1.5rem;
    justify-content: center;
  }
  .row-content { flex: 1; min-width: 0; }
  .row-title { display: block; font-size: .84rem; font-weight: 600; }
  .row-content :global(.switch-row) { margin-top: 0; }
  .row-content :global(p) { margin: 0; }
  .row-content :global(* + p) { margin-top: .3rem; }
  .row-control {
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    gap: .4rem;
  }
</style>
