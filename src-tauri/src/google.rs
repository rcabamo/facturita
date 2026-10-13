use crate::models::{CalendarEntry, ClientRef, EventRow};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::Deserialize;

const CALENDAR_BASE: &str = "https://www.googleapis.com/calendar/v3";

#[derive(Deserialize)]
struct EventList {
    #[serde(default, rename = "nextPageToken")]
    next_page_token: Option<String>,
    #[serde(default)]
    items: Vec<GEvent>,
}

#[derive(Deserialize)]
struct GEvent {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    start: Option<GDateTime>,
    #[serde(default)]
    end: Option<GDateTime>,
    #[serde(default)]
    attendees: Vec<GAttendee>,
    #[serde(default)]
    updated: Option<String>,
}

#[derive(Deserialize)]
struct GDateTime {
    #[serde(default, rename = "dateTime")]
    date_time: Option<String>,
    #[serde(default)]
    date: Option<String>,
}

#[derive(Deserialize)]
struct GAttendee {
    #[serde(default)]
    email: Option<String>,
    #[serde(default, rename = "displayName")]
    display_name: Option<String>,
    #[serde(default, rename = "responseStatus")]
    response_status: Option<String>,
    #[serde(default)]
    resource: Option<bool>,
    #[serde(default, rename = "self")]
    is_self: Option<bool>,
}

#[derive(Deserialize)]
struct CalendarList {
    #[serde(default)]
    items: Vec<GCalendar>,
}

#[derive(Deserialize)]
struct GCalendar {
    id: String,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    primary: bool,
    #[serde(default, rename = "accessRole")]
    access_role: Option<String>,
}

#[derive(Deserialize)]
struct UserInfo {
    #[serde(default)]
    email: Option<String>,
}

fn normalize_date_time(value: &Option<GDateTime>) -> Option<String> {
    let value = value.as_ref()?;
    if let Some(dt) = &value.date_time {
        if let Ok(parsed) = DateTime::parse_from_rfc3339(dt) {
            return Some(
                parsed
                    .with_timezone(&Utc)
                    .to_rfc3339_opts(SecondsFormat::Secs, true),
            );
        }
    }
    if let Some(date) = &value.date {
        return Some(format!("{}T00:00:00Z", date));
    }
    None
}

fn duration_minutes(start: &str, end: &str) -> Option<i64> {
    let start = DateTime::parse_from_rfc3339(start).ok()?;
    let end = DateTime::parse_from_rfc3339(end).ok()?;
    Some((end - start).num_minutes())
}

fn map_event(event: GEvent) -> Option<EventRow> {
    let id = event.id?;
    let start_ts = normalize_date_time(&event.start)?;
    let end_ts = normalize_date_time(&event.end).unwrap_or_else(|| start_ts.clone());
    let duration = duration_minutes(&start_ts, &end_ts);
    let clients = event
        .attendees
        .into_iter()
        .filter_map(|attendee| {
            if attendee.resource.unwrap_or(false) || attendee.is_self.unwrap_or(false) {
                return None;
            }
            let email = attendee.email?;
            Some(ClientRef {
                email,
                name: attendee.display_name,
                rsvp: attendee.response_status,
            })
        })
        .collect();
    Some(EventRow {
        id,
        calendar_id: String::new(),
        summary: event.summary,
        start_ts,
        end_ts,
        status: event.status.unwrap_or_else(|| "confirmed".to_string()),
        duration_min: duration,
        updated_ts: event.updated,
        clients,
    })
}

pub async fn list_calendars(
    http: &reqwest::Client,
    token: &str,
) -> Result<Vec<CalendarEntry>, String> {
    let url = format!("{}/users/me/calendarList?minAccessRole=reader", CALENDAR_BASE);
    let response = http
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Google respondió {}: {}", status, body));
    }
    let data: CalendarList = response.json().await.map_err(|e| e.to_string())?;
    Ok(data
        .items
        .into_iter()
        .map(|cal| CalendarEntry {
            id: cal.id,
            summary: cal.summary.unwrap_or_else(|| "(sin nombre)".to_string()),
            primary: cal.primary,
            selected: false,
            access_role: cal.access_role,
        })
        .collect())
}

pub async fn list_events(
    http: &reqwest::Client,
    token: &str,
    calendar_id: &str,
    time_min: &str,
    time_max: &str,
) -> Result<Vec<EventRow>, String> {
    let mut url = reqwest::Url::parse(CALENDAR_BASE).map_err(|e| e.to_string())?;
    url.path_segments_mut()
        .map_err(|_| "URL inválida".to_string())?
        .push("calendars")
        .push(calendar_id)
        .push("events");

    let mut page_token: Option<String> = None;
    let mut events = Vec::new();

    loop {
        let mut request = http
            .get(url.clone())
            .bearer_auth(token)
            .query(&[
                ("singleEvents", "true"),
                ("orderBy", "startTime"),
                ("showDeleted", "false"),
                ("maxResults", "2500"),
                ("timeMin", time_min),
                ("timeMax", time_max),
            ]);
        if let Some(token) = &page_token {
            request = request.query(&[("pageToken", token.as_str())]);
        }

        let response = request.send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Google Calendar respondió {}: {}", status, body));
        }

        let data: EventList = response.json().await.map_err(|e| e.to_string())?;
        for event in data.items {
            if let Some(mut mapped) = map_event(event) {
                mapped.calendar_id = calendar_id.to_string();
                events.push(mapped);
            }
        }

        match data.next_page_token {
            Some(token) if !token.is_empty() => page_token = Some(token),
            _ => break,
        }
    }

    Ok(events)
}

pub async fn user_email(http: &reqwest::Client, token: &str) -> Result<String, String> {
    let response = http
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Google respondió {}: {}", status, body));
    }
    let info: UserInfo = response.json().await.map_err(|e| e.to_string())?;
    info.email.ok_or_else(|| "No se pudo obtener el correo de la cuenta".to_string())
}
