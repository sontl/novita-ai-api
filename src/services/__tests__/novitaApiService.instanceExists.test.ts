import { NovitaApiService } from '../novitaApiService';
import { NovitaApiClientError } from '../../types/api';

// Mock the novitaClient
jest.mock('../../clients/novitaClient', () => ({
  novitaClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    healthCheck: jest.fn(),
    getCircuitBreakerState: jest.fn(),
    getQueueStatus: jest.fn()
  }
}));

jest.mock('../../utils/logger');

// Import the mocked client
import { novitaClient } from '../../clients/novitaClient';
const mockNovitaClient = novitaClient as jest.Mocked<typeof novitaClient>;

describe('NovitaApiService - instanceExists method', () => {
  let novitaApiService: NovitaApiService;

  beforeEach(() => {
    jest.clearAllMocks();
    novitaApiService = new NovitaApiService();
  });

  it('should return true when instance exists', async () => {
    const instanceId = 'existing-instance';

    // Mock successful response
    mockNovitaClient.get.mockResolvedValue({
      data: {
        id: instanceId,
        name: 'test-instance',
        status: 'running',
        productId: 'test-product',
        gpuNum: 1,
        createdAt: Date.now() / 1000 // Unix timestamp
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    });

    const exists = await novitaApiService.instanceExists(instanceId);
    expect(exists).toBe(true);
    expect(mockNovitaClient.get).toHaveBeenCalledWith(`/v1/gpu/instance?instanceId=${instanceId}`);
  });

  it('should return false when instance returns 404', async () => {
    const instanceId = 'non-existent-instance';

    // Mock 404 response
    const error = new Error('Request failed with status code 404');
    (error as any).response = {
      status: 404,
      data: { message: 'Instance not found' }
    };
    mockNovitaClient.get.mockRejectedValue(error);

    const exists = await novitaApiService.instanceExists(instanceId);
    expect(exists).toBe(false);
  });

  it('should throw for non-404 errors', async () => {
    const instanceId = 'error-instance';

    // Mock network error (500)
    const error = new Error('Request failed with status code 500');
    (error as any).response = {
      status: 500,
      data: { message: 'Internal server error' }
    };
    mockNovitaClient.get.mockRejectedValue(error);

    await expect(novitaApiService.instanceExists(instanceId))
      .rejects
      .toThrow('Internal server error');
  });

  it('should throw for network errors', async () => {
    const instanceId = 'network-error-instance';

    // Mock network error (no response)
    const error = new Error('Network Error');
    (error as any).code = 'ENOTFOUND';
    mockNovitaClient.get.mockRejectedValue(error);

    await expect(novitaApiService.instanceExists(instanceId))
      .rejects
      .toThrow('Network error - unable to connect to Novita.ai API');
  });
});