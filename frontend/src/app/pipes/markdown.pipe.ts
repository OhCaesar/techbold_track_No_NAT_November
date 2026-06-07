import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

/**
 * Render a markdown string to HTML for use with [innerHTML]. Pure pipe, so it
 * only re-parses when the input string changes. Angular's [innerHTML] binding
 * sanitizes the result, so the output is safe to bind directly.
 */
@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return marked.parse(value, { async: false, gfm: true, breaks: true }) as string;
  }
}
