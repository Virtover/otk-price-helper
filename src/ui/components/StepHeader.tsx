import { Group, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

interface Props {
  step: number;
  title: string;
  subtitle?: string;
  /** Step not reached yet (no input). */
  muted?: boolean;
  right?: ReactNode;
}

/** Numbered step heading: 1 Product → 2 Result → 3 Price list. */
export function StepHeader({ step, title, subtitle, muted, right }: Props) {
  return (
    <Group justify="space-between" align="center" wrap="nowrap" mb="xs">
      <Group gap="sm" wrap="nowrap">
        <div className="step-dot" data-muted={muted ? 'true' : undefined}>
          {step}
        </div>
        <div>
          <Title order={4} c={muted ? 'dimmed' : undefined} lh={1.2}>
            {title}
          </Title>
          {subtitle && (
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          )}
        </div>
      </Group>
      {right}
    </Group>
  );
}
