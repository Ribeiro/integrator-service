export class ResponseEventDto {
  request_id: string;
  statusCode: number;
  data: any;
  result: 'success' | 'failure';
}
