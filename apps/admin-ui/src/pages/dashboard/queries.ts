import { gql } from '@/shared/api/hasura/@gql';

export const DashboardMetricsQuery = gql(`
  query DashboardMetricsQuery {
    identities_total: itap_identities_aggregate {
      aggregate { count }
    }
    identities_verified: itap_identities_aggregate(where: { status: { _eq: "verified" } }) {
      aggregate { count }
    }
    identities_linked: itap_identities_aggregate(where: { profile_id: { _is_null: false } }) {
      aggregate { count }
    }
    profiles_total: itap_profiles_aggregate {
      aggregate { count }
    }
    facilities_total: itap_facilities_aggregate {
      aggregate { count }
    }
    segments_total: itap_segments_aggregate {
      aggregate { count }
    }
    recent_identities: itap_identities(order_by: { created_at: desc }, limit: 10) {
      id
      status
      created_at
      images
      profile {
        first_name
        last_name
      }
    }
    identity_timeline: itap_identities(order_by: { created_at: asc }) {
      created_at
    }
  }
`);
