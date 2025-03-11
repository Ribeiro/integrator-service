export class IncomingEventDto {
  request_id: string;
  payload: any;
  originService: string;
  destinationApi: string;
  destinationApiUrl: string;
  httpMethod: string;
  responseQueueUrl: string;
}
