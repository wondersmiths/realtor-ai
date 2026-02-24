'use client';

import { useState } from 'react';
import {
  ShieldCheck,
  Bot,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import type { FairHousingViolation } from '@/types/domain';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive';

const CONTEXT_OPTIONS = [
  { value: 'listing_description', label: 'Listing Description' },
  { value: 'advertisement', label: 'Advertisement' },
  { value: 'communication', label: 'Communication' },
];

const severityBadgeVariant: Record<string, BadgeVariant> = {
  low: 'secondary',
  medium: 'warning',
  high: 'destructive',
  critical: 'destructive',
};

const severityBadgeLabel: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';
  if (score >= 60) return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800';
  return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
}

interface ValidationResult {
  score: number;
  aiUsed: boolean;
  violations: FairHousingViolation[];
}

function highlightText(text: string, violations: FairHousingViolation[]): React.ReactNode {
  if (violations.length === 0) return text;

  // Sort violations by their position in the text (first occurrence)
  const matches: { start: number; end: number; violation: FairHousingViolation }[] = [];

  violations.forEach((v) => {
    const idx = text.toLowerCase().indexOf(v.text.toLowerCase());
    if (idx !== -1) {
      matches.push({ start: idx, end: idx + v.text.length, violation: v });
    }
  });

  // Sort by start position
  matches.sort((a, b) => a.start - b.start);

  if (matches.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  matches.forEach((m, i) => {
    if (m.start > lastEnd) {
      parts.push(text.slice(lastEnd, m.start));
    }
    parts.push(
      <mark
        key={i}
        className="rounded bg-red-100 px-0.5 text-red-800 dark:bg-red-900/40 dark:text-red-200"
        title={m.violation.explanation}
      >
        {text.slice(m.start, m.end)}
      </mark>
    );
    lastEnd = m.end;
  });

  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd));
  }

  return <>{parts}</>;
}

export default function FairHousingValidatorPage() {
  const [inputText, setInputText] = useState('');
  const [context, setContext] = useState('listing_description');
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!inputText.trim()) return;

    setIsValidating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/compliance/fair-housing/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          context,
        }),
      });

      if (!res.ok) throw new Error('Validation request failed');

      const json = await res.json();
      setResult({
        score: json.data?.score ?? json.score ?? 100,
        aiUsed: json.data?.aiUsed ?? json.aiUsed ?? false,
        violations: json.data?.violations ?? json.violations ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsValidating(false);
    }
  };

  const handleContextChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setContext(e.target.value);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
          Fair Housing Validator
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Check text for potential fair housing violations before publishing.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Input Text</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              label="Context"
              options={CONTEXT_OPTIONS}
              value={context}
              onChange={handleContextChange}
            />

            <Textarea
              label="Text to Validate"
              placeholder="Paste your listing description, advertisement, or communication text here..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={12}
              className="min-h-[240px]"
            />

            <Button
              onClick={handleValidate}
              disabled={!inputText.trim() || isValidating}
              loading={isValidating}
              className="w-full"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Validate
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            {!result && !error && !isValidating && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShieldCheck className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Enter text and click Validate to check for fair housing compliance.
                </p>
              </div>
            )}

            {isValidating && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Analyzing text for fair housing compliance...
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-6">
                {/* Score */}
                <div className={`rounded-lg border-2 p-4 ${scoreBgColor(result.score)}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                        <span className={`text-2xl font-bold ${scoreColor(result.score)}`}>
                          {result.score}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Compliance Score
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {result.score >= 80
                            ? 'Looks good!'
                            : result.score >= 60
                              ? 'Needs attention'
                              : 'Significant issues found'}
                        </p>
                      </div>
                    </div>
                    {result.aiUsed && (
                      <div className="flex items-center gap-1.5" title="AI-powered analysis">
                        <Bot className="h-4 w-4 text-green-500" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">AI</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Violations List */}
                {result.violations.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      No fair housing violations detected.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Violations ({result.violations.length})
                    </h4>

                    {/* Highlighted text preview */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {highlightText(inputText, result.violations)}
                      </p>
                    </div>

                    {/* Violation details */}
                    <ul className="space-y-2">
                      {result.violations.map((violation, index) => (
                        <li
                          key={index}
                          className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                        >
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{violation.category}</Badge>
                                <Badge variant={severityBadgeVariant[violation.severity] ?? 'secondary'}>
                                  {severityBadgeLabel[violation.severity] ?? violation.severity}
                                </Badge>
                              </div>
                              <p className="mt-2 text-sm text-gray-900 dark:text-gray-100">
                                <span className="font-medium">Matched: </span>
                                <span className="rounded bg-red-100 px-1 text-red-800 dark:bg-red-900/40 dark:text-red-200">
                                  &quot;{violation.text}&quot;
                                </span>
                              </p>
                              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                {violation.explanation}
                              </p>
                              <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                                <span className="font-medium">Suggestion: </span>
                                {violation.suggestion}
                              </p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
