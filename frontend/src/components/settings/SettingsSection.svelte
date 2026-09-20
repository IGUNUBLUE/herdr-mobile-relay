<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    title,
    children,
    class: className = '',
    ...rest
  }: HTMLAttributes<HTMLElement> & {
    title: string;
    children?: Snippet;
  } = $props();

  const labelId = $derived(`settings-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
</script>

<section class={`settings-section card ${className}`} aria-labelledby={labelId} {...rest}>
  <h3 class="section-heading" id={labelId} aria-label={title}>{title}</h3>
  <div class="section-body card">
    {@render children?.()}
  </div>
</section>

<style>
  /* The outer element keeps the .card hook for compatibility; the section
     label sits outside the visible card, so the card chrome is neutralized
     here and carried by .section-body instead. */
  .settings-section.card {
    background: none;
    border: 0;
    box-shadow: none;
    margin-bottom: 1.15rem;
    padding: 0;
  }
  .settings-section .section-heading {
    color: var(--muted);
    font-size: .72rem;
    font-weight: 650;
    letter-spacing: .07em;
    margin: 0 .9rem .4rem;
    text-transform: uppercase;
  }
  .section-body.card {
    margin-bottom: 0;
    overflow: hidden;
    padding: 0;
  }
</style>
