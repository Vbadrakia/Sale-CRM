import type { QueryClient } from '@tanstack/react-query';

export type CrmDataKind = 'leads' | 'followups' | 'customers';

export async function invalidateCrmData(
  queryClient: QueryClient,
  kinds: CrmDataKind[] = [],
): Promise<void> {
  const promises: Promise<void>[] = [
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ];

  for (const kind of kinds) {
    promises.push(queryClient.invalidateQueries({ queryKey: [kind] }));
  }

  await Promise.all(promises);
}
