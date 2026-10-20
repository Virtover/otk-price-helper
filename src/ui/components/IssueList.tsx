import { Alert, Anchor, List, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { Locale } from '../../core/money';
import type { Issue, IssueLevel } from '../../core/types';
import { issueMessage } from '../format';

const LEVELS: { level: IssueLevel; color: string }[] = [
  { level: 'error', color: 'red' },
  { level: 'warning', color: 'yellow' },
  { level: 'info', color: 'blue' },
];

interface Props {
  issues: Issue[];
  lang: Locale;
  onGoTo: (path: string) => void;
  title?: string;
}

/** Messages grouped by severity; each one links to the field to change. */
export function IssueList({ issues, lang, onGoTo, title }: Props) {
  const { t } = useTranslation();
  if (issues.length === 0) return null;
  return (
    <>
      {LEVELS.map(({ level, color }) => {
        const group = issues.filter((i) => i.level === level);
        if (group.length === 0) return null;
        return (
          <Alert key={level} color={color} variant="light" title={level === 'error' ? title : undefined} data-testid={`issues-${level}`}>
            <List size="sm" spacing={4}>
              {group.map((issue, idx) => (
                <List.Item key={`${issue.code}-${issue.path ?? ''}-${idx}`}>
                  <Text span size="sm">
                    {issueMessage(issue, lang, t)}
                  </Text>
                  {issue.path && (
                    <>
                      {' '}
                      <Anchor component="button" type="button" size="sm" onClick={() => onGoTo(issue.path!)}>
                        {t('issues.goTo')} →
                      </Anchor>
                    </>
                  )}
                </List.Item>
              ))}
            </List>
          </Alert>
        );
      })}
    </>
  );
}
